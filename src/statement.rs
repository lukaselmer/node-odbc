//! The `ODBCStatement` object handed to JavaScript.
//!
//! Like a connection, it holds only a handle on the thread plus the id of the
//! prepared statement the session owns.

use crate::connection::{read_parameters, with_session};
use crate::promise::{self, settle_result_set, settle_unit};
use crate::session::Session;
use crate::thread::OdbcThread;
use napi::bindgen_prelude::*;
use napi_derive::napi;
use std::sync::Arc;

#[napi(js_name = "ODBCStatement")]
pub struct OdbcStatement {
    thread: Arc<OdbcThread>,
    id: u32,
}

#[napi]
impl OdbcStatement {
    #[napi(ts_return_type = "Promise<void>")]
    pub fn prepare<'env>(
        &self,
        env: &'env Env, sql: String) -> Result<Object<'env>> {
        let id = self.id;
        self.act(env, move |session| session.prepare(id, &sql))
    }

    #[napi(ts_return_type = "Promise<void>")]
    pub fn bind<'env>(
        &self,
        env: &'env Env, parameters: Vec<Unknown>) -> Result<Object<'env>> {
        let id = self.id;
        let bound = read_parameters(Some(parameters))?;
        self.act(env, move |session| session.bind(id, bound))
    }

    #[napi(ts_return_type = "Promise<Result>")]
    pub fn execute<'env>(
        &self,
        env: &'env Env) -> Result<Object<'env>> {
        let id = self.id;
        let (deferred, promise) = promise::result_set(env)?;
        self.enqueue(move |session| {
            let outcome = with_session(session).and_then(|session| session.execute(id));
            settle_result_set(deferred, outcome);
        })?;
        Ok(promise)
    }

    #[napi(ts_return_type = "Promise<void>")]
    pub fn close<'env>(
        &self,
        env: &'env Env) -> Result<Object<'env>> {
        let id = self.id;
        let (deferred, promise) = promise::unit(env)?;
        self.enqueue(move |session| {
            if let Some(session) = session.as_mut() {
                session.remove_statement(id);
            }
            settle_unit(deferred, Ok(()));
        })?;
        Ok(promise)
    }

    fn act<'env>(
        &self,
        env: &'env Env,
        action: impl FnOnce(&mut Session) -> crate::error::OdbcResult<()> + Send + 'static,
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

impl OdbcStatement {
    pub fn new(thread: Arc<OdbcThread>, id: u32) -> Self {
        Self { thread, id }
    }
}
