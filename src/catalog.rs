//! `SQLTables` and `SQLColumns`.
//!
//! Called through `odbc-sys` rather than `odbc-api`'s wrappers, which take
//! `&str` and therefore always pass a pointer to a string. ODBC distinguishes a
//! null pointer, meaning "do not restrict the search", from an empty string,
//! meaning "match only entries whose value is empty", and the JavaScript API
//! passes `null` for exactly the first case.

use crate::error::OdbcResult;
use crate::query;
use crate::value::ResultSet;
use odbc_api::CursorImpl;
use odbc_api::handles::{AsStatementRef, Statement as _};
use odbc_api::sys::{HStmt, SqlReturn};

/// The optional catalog-function arguments, in the order ODBC takes them.
pub struct Selector {
    pub catalog: Option<String>,
    pub schema: Option<String>,
    pub table: Option<String>,
    /// A table type for `SQLTables`, a column name for `SQLColumns`.
    pub fourth: Option<String>,
}

pub fn tables(statement: &mut impl AsStatementRef, selector: &Selector) -> OdbcResult<ResultSet> {
    catalog_query(
        statement,
        selector,
        "[odbc] Error listing tables",
        |handle, arguments| unsafe {
            odbc_api::sys::SQLTables(
                handle,
                arguments.catalog.0,
                arguments.catalog.1,
                arguments.schema.0,
                arguments.schema.1,
                arguments.table.0,
                arguments.table.1,
                arguments.fourth.0,
                arguments.fourth.1,
            )
        },
    )
}

pub fn columns(statement: &mut impl AsStatementRef, selector: &Selector) -> OdbcResult<ResultSet> {
    catalog_query(
        statement,
        selector,
        "[odbc] Error listing columns",
        |handle, arguments| unsafe {
            odbc_api::sys::SQLColumns(
                handle,
                arguments.catalog.0,
                arguments.catalog.1,
                arguments.schema.0,
                arguments.schema.1,
                arguments.table.0,
                arguments.table.1,
                arguments.fourth.0,
                arguments.fourth.1,
            )
        },
    )
}

type Argument = (*const SqlChar, i16);

struct Arguments {
    catalog: Argument,
    schema: Argument,
    table: Argument,
    fourth: Argument,
}

#[cfg(not(windows))]
type SqlChar = u8;
#[cfg(windows)]
type SqlChar = u16;

fn catalog_query(
    statement: &mut impl AsStatementRef,
    selector: &Selector,
    message: &str,
    call: impl FnOnce(HStmt, &Arguments) -> SqlReturn,
) -> OdbcResult<ResultSet> {
    let catalog = selector.catalog.as_deref().map(Restriction::new);
    let schema = selector.schema.as_deref().map(Restriction::new);
    let table = selector.table.as_deref().map(Restriction::new);
    let fourth = selector.fourth.as_deref().map(Restriction::new);
    let arguments = Arguments {
        catalog: argument(&catalog),
        schema: argument(&schema),
        table: argument(&table),
        fourth: argument(&fourth),
    };

    let handle = statement.as_stmt_ref();
    let return_code = call(handle.as_sys(), &arguments);
    if return_code == SqlReturn::ERROR || return_code == SqlReturn::INVALID_HANDLE {
        return Err(crate::error::OdbcFailure {
            message: message.to_owned(),
            errors: crate::error::or_placeholder(crate::error::collect(&handle)),
        });
    }

    // Safe: the call succeeded, so the statement is in cursor state.
    let mut cursor = unsafe { CursorImpl::new(handle) };
    let (columns, rows) = query::collect(&mut cursor)?;
    let row_count = rows.len() as i64;
    drop(cursor);

    Ok(ResultSet {
        columns,
        rows,
        row_count,
        statement: None,
    })
}

/// A restriction the caller supplied, in the encoding the driver manager
/// expects.
///
/// `odbc-api`'s `SqlText` cannot be used here: it hands out a null pointer for
/// an empty string, which is precisely the distinction this module exists to
/// preserve.
struct Restriction(Vec<SqlChar>);

impl Restriction {
    fn new(text: &str) -> Self {
        let mut units: Vec<SqlChar> = encode(text);
        units.push(0);
        Self(units)
    }

    fn as_argument(&self) -> Argument {
        (self.0.as_ptr(), (self.0.len() - 1) as i16)
    }
}

#[cfg(not(windows))]
fn encode(text: &str) -> Vec<SqlChar> {
    text.as_bytes().to_vec()
}

#[cfg(windows)]
fn encode(text: &str) -> Vec<SqlChar> {
    text.encode_utf16().collect()
}

fn argument(restriction: &Option<Restriction>) -> Argument {
    match restriction {
        Some(restriction) => restriction.as_argument(),
        None => (std::ptr::null(), 0),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn an_absent_restriction_is_a_null_pointer() {
        let absent = None;
        let (pointer, length) = argument(&absent);
        assert!(pointer.is_null());
        assert_eq!(length, 0);
    }

    #[test]
    fn a_present_restriction_carries_its_length() {
        let present = Some(Restriction::new("public"));
        let (pointer, length) = argument(&present);
        assert!(!pointer.is_null());
        assert_eq!(length, 6);
    }

    /// An empty string is a restriction in its own right, not the absence of
    /// one, and must not collapse into a null pointer.
    #[test]
    fn an_empty_restriction_is_not_absent() {
        let empty = Some(Restriction::new(""));
        let (pointer, length) = argument(&empty);
        assert!(!pointer.is_null());
        assert_eq!(length, 0);
    }
}
