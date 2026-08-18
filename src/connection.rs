//! The `ODBCConnection` object handed to JavaScript.
//!
//! It holds nothing but a handle on the connection's thread: the session and
//! every ODBC handle live on that thread and never cross it. Each method
//! returns a promise that the thread settles when the work is done.

use crate::catalog::Selector;
use crate::error::{OdbcFailure, OdbcResult};
use crate::promise::{self, settle_result_set, settle_unit};
use crate::query::Parameter;
use crate::session::Session;
use crate::statement::OdbcStatement;
use crate::thread::OdbcThread;
use crate::value::ResultSet;
use napi::bindgen_prelude::*;
use napi_derive::napi;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};

#[napi(js_name = "ODBCConnection")]
pub struct OdbcConnection {
    thread: Arc<OdbcThread>,
    /// What the driver last said about the link, for the `connected` getter to
    /// fall back on while the connection's thread is busy.
    last_known_connected: Arc<AtomicBool>,
}

#[napi]
impl OdbcConnection {
    #[napi(ts_return_type = "Promise<Result>")]
    pub fn query<'env>(
        &self,
        env: &'env Env,
        sql: String,
        parameters: Option<Vec<Unknown>>,
    ) -> Result<Object<'env>> {
        let bound = read_parameters(parameters)?;
        self.result_set(env, move |session| session.query(&sql, &bound))
    }

    #[napi(ts_return_type = "Promise<ODBCStatement>")]
    pub fn create_statement<'env>(
        &self,
        env: &'env Env) -> Result<Object<'env>> {
        let (deferred, promise) = promise::deferred::<OdbcStatement>(env)?;
        let thread = Arc::clone(&self.thread);

        self.enqueue(move |session| {
            match with_session(session).map(Session::create_statement) {
                Ok(id) => deferred.resolve(Box::new(move |_| Ok(OdbcStatement::new(thread, id)))),
                Err(failure) => promise::reject(deferred, failure),
            }
        })?;
        Ok(promise)
    }

    #[napi(ts_return_type = "Promise<Result>")]
    pub fn tables<'env>(
        &self,
        env: &'env Env,
        catalog: Option<String>,
        schema: Option<String>,
        table: Option<String>,
        table_type: Option<String>,
    ) -> Result<Object<'env>> {
        let selector = Selector { catalog, schema, table, fourth: table_type };
        self.result_set(env, move |session| session.tables(&selector))
    }

    #[napi(ts_return_type = "Promise<Result>")]
    pub fn columns<'env>(
        &self,
        env: &'env Env,
        catalog: Option<String>,
        schema: Option<String>,
        table: Option<String>,
        column: Option<String>,
    ) -> Result<Object<'env>> {
        let selector = Selector { catalog, schema, table, fourth: column };
        self.result_set(env, move |session| session.columns(&selector))
    }

    /// Whether the driver still considers the link to be up.
    ///
    /// Synchronous, so it must never wait for the connection's thread: reading
    /// a property while a slow query is in flight would stall the whole event
    /// loop. It asks only when that thread is idle, and otherwise reports what
    /// the driver last said.
    #[napi(getter)]
    pub fn connected(&self) -> bool {
        match self.thread.run_if_idle(|session| session.as_ref().is_some_and(Session::is_connected))
        {
            Some(connected) => {
                self.last_known_connected.store(connected, Ordering::Relaxed);
                connected
            }
            None => self.last_known_connected.load(Ordering::Relaxed),
        }
    }

    #[napi(ts_return_type = "Promise<void>")]
    pub fn begin_transaction<'env>(
        &self,
        env: &'env Env) -> Result<Object<'env>> {
        self.act(env, Session::begin_transaction)
    }

    #[napi(ts_return_type = "Promise<void>")]
    pub fn commit<'env>(
        &self,
        env: &'env Env) -> Result<Object<'env>> {
        self.act(env, Session::commit)
    }

    #[napi(ts_return_type = "Promise<void>")]
    pub fn rollback<'env>(
        &self,
        env: &'env Env) -> Result<Object<'env>> {
        self.act(env, Session::rollback)
    }

    /// Disconnects and then stops the thread, in that order. The driver only
    /// releases its per-thread session state once the thread is gone, so a
    /// connection that outlived its thread would strand the session.
    #[napi(ts_return_type = "Promise<void>")]
    pub fn close<'env>(
        &self,
        env: &'env Env) -> Result<Object<'env>> {
        let (deferred, promise) = promise::unit(env)?;
        let thread = Arc::clone(&self.thread);
        let connected = Arc::clone(&self.last_known_connected);

        self.enqueue(move |session| {
            let outcome = match session.take() {
                Some(session) => session.disconnect(),
                None => Ok(()),
            };
            connected.store(false, Ordering::Relaxed);
            settle_unit(deferred, outcome);

            // Stopping joins this very thread, so it cannot run here.
            std::thread::spawn(move || thread.stop());
        })?;
        Ok(promise)
    }

    fn result_set<'env>(
        &self,
        env: &'env Env,
        action: impl FnOnce(&mut Session) -> OdbcResult<ResultSet> + Send + 'static,
    ) -> Result<Object<'env>> {
        let (deferred, promise) = promise::result_set(env)?;
        self.enqueue(move |session| {
            settle_result_set(deferred, with_session(session).and_then(action));
        })?;
        Ok(promise)
    }

    fn act<'env>(
        &self,
        env: &'env Env,
        action: impl FnOnce(&mut Session) -> OdbcResult<()> + Send + 'static,
    ) -> Result<Object<'env>> {
        let (deferred, promise) = promise::unit(env)?;
        self.enqueue(move |session| {
            settle_unit(deferred, with_session(session).and_then(action));
        })?;
        Ok(promise)
    }

    fn enqueue(&self, job: impl FnOnce(&mut Option<Session>) + Send + 'static) -> Result<()> {
        self.thread.enqueue(job).map_err(|failure| Error::from_reason(failure.message))
    }
}

impl OdbcConnection {
    pub fn new(thread: Arc<OdbcThread>) -> Self {
        Self { thread, last_known_connected: Arc::new(AtomicBool::new(true)) }
    }
}

pub fn with_session(session: &mut Option<Session>) -> OdbcResult<&mut Session> {
    session.as_mut().ok_or_else(|| OdbcFailure::new("[odbc] The connection is closed."))
}

pub fn read_parameters(parameters: Option<Vec<Unknown>>) -> Result<Vec<Parameter>> {
    let Some(parameters) = parameters else { return Ok(Vec::new()) };
    parameters.iter().map(read_parameter).collect()
}

fn read_parameter(value: &Unknown) -> Result<Parameter> {
    match value.get_type()? {
        ValueType::Null | ValueType::Undefined => Ok(Parameter::Null),
        ValueType::Boolean => Ok(Parameter::Boolean(value.coerce_to_bool()?)),
        ValueType::Number => Ok(Parameter::Number(value.coerce_to_number()?.get_double()?)),
        ValueType::BigInt => Ok(Parameter::BigInt(value.coerce_to_number()?.get_int64()?)),
        _ => Ok(Parameter::Text(value.coerce_to_string()?.into_utf8()?.into_owned()?)),
    }
}
