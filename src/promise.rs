//! Settling JavaScript promises from the connection's thread.
//!
//! Every asynchronous method returns a promise the ODBC thread settles
//! directly, so there is no callback layer to wrap and no libuv worker parked
//! waiting for a result.

use crate::error::OdbcFailure;
use crate::result::{JsOdbcError, JsResultSet};
use crate::value::ResultSet;
use napi::bindgen_prelude::*;

/// The resolver runs on the JavaScript thread, which is what lets a rejection
/// build a real `Error` carrying `odbcErrors` rather than only a message.
type Resolver<T> = Box<dyn FnOnce(Env) -> Result<T> + Send>;
pub type Deferred<T> = napi::JsDeferred<T, Resolver<T>>;

pub type ResultSetPromise = Deferred<JsResultSet>;
pub type UnitPromise = Deferred<()>;

pub fn deferred<T: ToNapiValue>(env: &Env) -> Result<(Deferred<T>, Object<'_>)> {
    env.create_deferred()
}

pub fn result_set(env: &Env) -> Result<(ResultSetPromise, Object<'_>)> {
    deferred(env)
}

pub fn unit(env: &Env) -> Result<(UnitPromise, Object<'_>)> {
    deferred(env)
}

pub fn settle_result_set(
    deferred: ResultSetPromise,
    outcome: std::result::Result<ResultSet, OdbcFailure>,
) {
    match outcome {
        Ok(rows) => deferred.resolve(Box::new(move |_| Ok(JsResultSet(rows)))),
        Err(failure) => deferred.resolve(Box::new(move |env| Err(rejection(&env, failure)))),
    }
}

pub fn settle_unit(deferred: UnitPromise, outcome: std::result::Result<(), OdbcFailure>) {
    match outcome {
        Ok(()) => deferred.resolve(Box::new(move |_| Ok(()))),
        Err(failure) => deferred.resolve(Box::new(move |env| Err(rejection(&env, failure)))),
    }
}

/// Reject a deferred whose success type is not one of the two above.
pub fn reject<T: ToNapiValue>(deferred: Deferred<T>, failure: OdbcFailure) {
    deferred.resolve(Box::new(move |env| Err(rejection(&env, failure))));
}

/// Build the error object on the JavaScript thread and hand it back as the
/// rejection value, so `odbcErrors` survives.
fn rejection(env: &Env, failure: OdbcFailure) -> Error {
    let message = failure.message.clone();
    match error_object(env, failure) {
        Ok(value) => Error::from(value),
        Err(_) => Error::from_reason(message),
    }
}

fn error_object(env: &Env, failure: OdbcFailure) -> Result<Unknown<'_>> {
    let raw = unsafe { ToNapiValue::to_napi_value(env.raw(), JsOdbcError(failure))? };
    unsafe { Unknown::from_napi_value(env.raw(), raw) }
}
