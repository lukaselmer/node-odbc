mod catalog;
mod connection;
mod constants;
mod error;
mod promise;
mod query;
mod result;
mod session;
mod statement;
mod thread;
mod value;

use crate::connection::OdbcConnection;
use crate::session::{ConnectionOptions, Session};
use crate::thread::OdbcThread;
use napi::bindgen_prelude::*;
use napi_derive::napi;
use std::sync::Arc;

#[napi(object)]
pub struct ConnectConfiguration {
    pub connection_string: String,
    pub connection_timeout: Option<u32>,
    pub login_timeout: Option<u32>,
}

#[napi]
pub fn odbc_constants(env: &Env) -> Result<Object<'_>> {
    let mut constants = Object::new(env)?;
    for (name, value) in constants::ODBC_CONSTANTS {
        constants.set(*name, *value as f64)?;
    }
    Ok(constants)
}

/// `connect(connectionString)`.
///
/// Returns as soon as the work is queued. The connection's own thread performs
/// `SQLDriverConnect` and settles the promise, so no libuv worker is held for
/// the duration.
#[napi(ts_return_type = "Promise<ODBCConnection>")]
pub fn connect<'env>(
    env: &'env Env,
    connection_string: Either<String, ConnectConfiguration>,
) -> Result<Object<'env>> {
    let (target, options) = configuration(connection_string);
    let (deferred, promise) = promise::deferred::<OdbcConnection>(env)?;

    let thread =
        Arc::new(OdbcThread::spawn().map_err(|failure| Error::from_reason(failure.message))?);
    let owned = Arc::clone(&thread);

    thread
        .enqueue(move |slot| match Session::connect(&target, options) {
            Ok(session) => {
                *slot = Some(session);
                deferred.resolve(Box::new(move |_| Ok(OdbcConnection::new(owned))));
            }
            Err(failure) => promise::reject(deferred, failure),
        })
        .map_err(|failure| Error::from_reason(failure.message))?;

    Ok(promise)
}

fn configuration(input: Either<String, ConnectConfiguration>) -> (String, ConnectionOptions) {
    match input {
        Either::A(connection_string) => (connection_string, ConnectionOptions::default()),
        Either::B(configuration) => (
            configuration.connection_string,
            ConnectionOptions {
                connection_timeout: configuration.connection_timeout.unwrap_or(0),
                login_timeout: configuration.login_timeout.unwrap_or(0),
            },
        ),
    }
}
