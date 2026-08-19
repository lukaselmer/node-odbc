//! A live connection, its prepared statements, and the work run against them.
//!
//! Owned by, and only ever touched from, the connection's own thread.

use crate::catalog::{self, Selector};
use crate::error::{OdbcFailure, OdbcResult};
use crate::query::{self, Parameter};
use crate::value::ResultSet;
use odbc_api::{
    Connection, ConnectionOptions as DriverOptions, ConnectionTransitions, Cursor, Environment,
    Preallocated, Prepared, SharedConnection, handles::StatementConnection,
};
use std::collections::HashMap;
use std::sync::{Arc, Mutex, OnceLock};

/// Owned rather than borrowed from the connection, which is what lets a
/// statement outlive the call that created it and sit in a JavaScript object.
type OwnedStatement = Prepared<StatementConnection<SharedConnection<'static>>>;
type OwnedPreallocated = Preallocated<StatementConnection<SharedConnection<'static>>>;

#[derive(Debug, Clone, Default)]
pub struct ConnectionOptions {
    pub login_timeout: u32,
}

pub struct Session {
    connection: SharedConnection<'static>,
    statements: HashMap<u32, StatementSlot>,
    next_statement_id: u32,
}

/// A statement is created empty, gains a prepared handle, and then accumulates
/// the parameters `bind` was given.
#[derive(Default)]
struct StatementSlot {
    prepared: Option<OwnedStatement>,
    sql: Option<String>,
    parameters: Vec<Parameter>,
}

impl Session {
    pub fn connect(connection_string: &str, options: ConnectionOptions) -> OdbcResult<Self> {
        let environment = shared_environment()?;
        let connection = environment
            .connect_with_connection_string(connection_string, driver_options(&options))
            .map_err(|error| query::plain(error, "[odbc] Error connecting to the database"))?;

        Ok(Self {
            connection: Arc::new(Mutex::new(connection)),
            statements: HashMap::new(),
            next_statement_id: 0,
        })
    }

    /// One-shot execution. Uses a preallocated statement rather than
    /// `Connection::execute` so the row count is still readable once the
    /// cursor is done, which is what `result.count` reports for
    /// INSERT/UPDATE/DELETE.
    pub fn query(&mut self, sql: &str, parameters: &[Parameter]) -> OdbcResult<ResultSet> {
        let mut statement = self.preallocate()?;
        let bound = query::bind(parameters);

        let cursor = statement
            .execute(sql, bound.as_slice())
            .map_err(|error| query::plain(error, "[odbc] Error executing the statement"))?;

        let drained = drain(cursor)?;
        Ok(assemble(
            drained,
            statement.affected_rows(),
            Some(sql.to_owned()),
        ))
    }

    pub fn tables(&mut self, selector: &Selector) -> OdbcResult<ResultSet> {
        let mut statement = self.preallocate()?;
        catalog::tables(&mut statement, selector)
    }

    pub fn columns(&mut self, selector: &Selector) -> OdbcResult<ResultSet> {
        let mut statement = self.preallocate()?;
        catalog::columns(&mut statement, selector)
    }

    /// Ask the driver whether the link is still up.
    ///
    /// Only the driver knows, so this cannot be derived, and it is the one
    /// synchronous getter that has to reach ODBC at all. It therefore runs only
    /// when the connection's thread is idle; see the getter in `connection.rs`.
    pub fn is_connected(&self) -> bool {
        let connection = self.connection.lock().expect("connection poisoned");
        !connection.is_dead().unwrap_or(false)
    }

    pub fn create_statement(&mut self) -> u32 {
        let id = self.next_statement_id;
        self.next_statement_id += 1;
        self.statements.insert(id, StatementSlot::default());
        id
    }

    pub fn prepare(&mut self, id: u32, sql: &str) -> OdbcResult<()> {
        let connection = Arc::clone(&self.connection);
        let prepared = connection
            .into_prepared(sql)
            .map_err(|error| query::plain(error, "[odbc] Error preparing the statement"))?;

        let slot = self.slot(id)?;
        slot.prepared = Some(prepared);
        slot.sql = Some(sql.to_owned());
        slot.parameters.clear();
        Ok(())
    }

    /// Rejects a parameter list the statement cannot take, rather than letting
    /// the driver fail later at execute time with a less obvious message.
    pub fn bind(&mut self, id: u32, parameters: Vec<Parameter>) -> OdbcResult<()> {
        let slot = self.slot(id)?;
        let statement = slot.prepared.as_mut().ok_or_else(not_prepared)?;

        let expected = statement
            .num_params()
            .map_err(|error| query::plain(error, "[odbc] Error reading the parameter count"))?;
        if expected as usize != parameters.len() {
            return Err(OdbcFailure::new(format!(
                "[odbc] The statement takes {expected} parameters, but {} were bound.",
                parameters.len()
            )));
        }

        slot.parameters = parameters;
        Ok(())
    }

    pub fn execute(&mut self, id: u32) -> OdbcResult<ResultSet> {
        let slot = self.slot(id)?;
        let sql = slot.sql.clone();
        let bound = query::bind(&slot.parameters);
        let statement = slot.prepared.as_mut().ok_or_else(not_prepared)?;

        let cursor = statement
            .execute(bound.as_slice())
            .map_err(|error| query::plain(error, "[odbc] Error executing the statement"))?;

        let drained = drain(cursor)?;
        Ok(assemble(drained, statement.affected_rows(), sql))
    }

    pub fn remove_statement(&mut self, id: u32) {
        self.statements.remove(&id);
    }

    pub fn begin_transaction(&mut self) -> OdbcResult<()> {
        self.act("[odbc] Error beginning the transaction", |connection| {
            connection.set_autocommit(false)
        })
    }

    pub fn commit(&mut self) -> OdbcResult<()> {
        self.act("[odbc] Error committing the transaction", |connection| {
            connection.commit()?;
            connection.set_autocommit(true)
        })
    }

    pub fn rollback(&mut self) -> OdbcResult<()> {
        self.act("[odbc] Error rolling back the transaction", |connection| {
            connection.rollback()?;
            connection.set_autocommit(true)
        })
    }

    /// Statements hold a reference to the connection, so they go first.
    pub fn disconnect(mut self) -> OdbcResult<()> {
        self.statements.clear();
        Ok(())
    }

    fn preallocate(&self) -> OdbcResult<OwnedPreallocated> {
        Arc::clone(&self.connection)
            .into_preallocated()
            .map_err(|error| query::plain(error, "[odbc] Error allocating a statement handle"))
    }

    fn slot(&mut self, id: u32) -> OdbcResult<&mut StatementSlot> {
        self.statements
            .get_mut(&id)
            .ok_or_else(|| OdbcFailure::new("[odbc] The statement is closed."))
    }

    fn act(
        &self,
        message: &str,
        action: impl FnOnce(&Connection<'static>) -> Result<(), odbc_api::Error>,
    ) -> OdbcResult<()> {
        let connection = self.connection.lock().expect("connection poisoned");
        action(&connection).map_err(|error| query::plain(error, message))
    }
}

/// Consumes the cursor, so that the statement is free again: `SQLRowCount`
/// only reports meaningfully once the result set has been read.
fn drain(cursor: Option<impl Cursor>) -> OdbcResult<Option<Drained>> {
    match cursor {
        Some(mut cursor) => Ok(Some(query::collect(&mut cursor)?)),
        None => Ok(None),
    }
}

fn assemble(drained: Option<Drained>, row_count: i64, sql: Option<String>) -> ResultSet {
    let Some((columns, rows)) = drained else {
        return query::empty_result(sql, row_count);
    };
    ResultSet {
        columns,
        rows,
        row_count,
        statement: sql,
    }
}

type Drained = (
    Vec<crate::value::ColumnInfo>,
    Vec<Vec<crate::value::CellValue>>,
);

/// `SQLRowCount` is what `result.count` reports; a driver that will not answer
/// is reported as zero rather than failing the query.
trait RowCount {
    fn affected_rows(&mut self) -> i64;
}

impl RowCount for OwnedPreallocated {
    fn affected_rows(&mut self) -> i64 {
        self.row_count().ok().flatten().unwrap_or(0) as i64
    }
}

impl RowCount for OwnedStatement {
    fn affected_rows(&mut self) -> i64 {
        self.row_count().ok().flatten().unwrap_or(0) as i64
    }
}

fn not_prepared() -> OdbcFailure {
    OdbcFailure::new("[odbc] The statement has not been prepared.")
}

fn driver_options(options: &ConnectionOptions) -> DriverOptions {
    DriverOptions {
        login_timeout_sec: (options.login_timeout > 0).then_some(options.login_timeout),
        packet_size: None,
    }
}

/// One environment for the process, as the C++ addon had. `Environment` is
/// `Sync`, so every connection thread can reach it.
fn shared_environment() -> OdbcResult<&'static Environment> {
    static ENVIRONMENT: OnceLock<Result<Environment, odbc_api::Error>> = OnceLock::new();

    ENVIRONMENT
        .get_or_init(Environment::new)
        .as_ref()
        .map_err(|error| OdbcFailure::new(format!("[odbc] {error}")))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::value::CellValue;

    #[test]
    fn shares_one_environment_across_calls() {
        let first = shared_environment().expect("no environment");
        let second = shared_environment().expect("no environment");
        assert!(std::ptr::eq(first, second));
    }

    #[test]
    fn reports_diagnostics_for_an_unreachable_data_source() {
        let Err(failure) =
            Session::connect("DSN=does-not-exist-9182", ConnectionOptions::default())
        else {
            panic!("connect should fail");
        };
        assert!(!failure.errors.is_empty());
        assert!(failure.message.contains("Error connecting"));
    }

    #[test]
    fn passes_a_login_timeout_to_the_driver() {
        let options = ConnectionOptions { login_timeout: 7 };
        assert_eq!(driver_options(&options).login_timeout_sec, Some(7));
    }

    #[test]
    fn leaves_the_login_timeout_to_the_driver_when_it_is_not_set() {
        let options = ConnectionOptions { login_timeout: 0 };
        assert_eq!(driver_options(&options).login_timeout_sec, None);
    }

    /// Set `TEST_CONNECTION_STRING` to run the tests that need a database.
    fn live_session() -> Option<Session> {
        let connection_string = std::env::var("TEST_CONNECTION_STRING").ok()?;
        Some(Session::connect(&connection_string, ConnectionOptions::default()).expect("connect"))
    }

    /// Round-trips through a table of its own, so it neither depends on nor
    /// disturbs whatever else is in the database.
    #[test]
    fn reads_back_what_it_wrote() {
        let Some(mut session) = live_session() else {
            return;
        };
        let table = "rust_session_test";

        let _ = session.query(&format!("DROP TABLE {table}"), &[]);
        session
            .query(
                &format!("CREATE TABLE {table} (id INTEGER, name VARCHAR(24))"),
                &[],
            )
            .expect("create");
        let written = session
            .query(
                &format!("INSERT INTO {table} VALUES (1, 'anna'), (2, NULL)"),
                &[],
            )
            .expect("insert");
        assert_eq!(written.row_count, 2);

        let read = session
            .query(&format!("SELECT id, name FROM {table} ORDER BY id"), &[])
            .expect("select");
        assert_eq!(read.columns.len(), 2);
        assert_eq!(read.rows.len(), 2);
        assert_eq!(read.rows[0][1], CellValue::Text("anna".to_owned()));
        assert_eq!(read.rows[1][1], CellValue::Null);

        session
            .query(&format!("DROP TABLE {table}"), &[])
            .expect("drop");
    }

    #[test]
    fn omits_an_unset_login_timeout() {
        assert_eq!(
            driver_options(&ConnectionOptions::default()).login_timeout_sec,
            None
        );
    }
}
