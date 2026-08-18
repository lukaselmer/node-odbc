//! ODBC diagnostics, translated into the JavaScript error shape.
//!
//! A failed call reaches JavaScript as an `Error` carrying an `odbcErrors`
//! array. Callers depend on getting *every* record, not just the first: the
//! SQLSTATE `08` class that marks a dropped connection is often not in record
//! one.

use odbc_api::handles::{DiagnosticStream, Diagnostics, slice_to_cow_utf8};

pub type OdbcResult<T> = Result<T, OdbcFailure>;

#[derive(Debug, Clone)]
pub struct OdbcFailure {
    pub message: String,
    pub errors: Vec<OdbcError>,
}

#[derive(Debug, Clone)]
pub struct OdbcError {
    pub state: String,
    pub code: i32,
    pub message: String,
}

const NO_DIAGNOSTICS: &str = "<No error information available>";

impl OdbcFailure {
    pub fn new(message: impl Into<String>) -> Self {
        Self {
            message: message.into(),
            errors: Vec::new(),
        }
    }

    /// Prefer the handle's own records, which `odbc-api` reduces to one.
    ///
    /// The handle still holds its diagnostics at this point: the driver only
    /// discards them on the next call against that handle.
    pub fn from_handle(
        error: odbc_api::Error,
        handle: &(impl Diagnostics + ?Sized),
        message: impl Into<String>,
    ) -> Self {
        let mut errors = collect(handle);
        if errors.is_empty() {
            errors = reported_by(&error);
        }
        Self {
            message: message.into(),
            errors,
        }
    }

    pub fn from_error(error: odbc_api::Error, message: impl Into<String>) -> Self {
        Self {
            message: message.into(),
            errors: reported_by(&error),
        }
    }
}

/// Every diagnostic record attached to a handle.
pub fn collect(handle: &(impl Diagnostics + ?Sized)) -> Vec<OdbcError> {
    let mut errors = Vec::new();
    let mut records = DiagnosticStream::new(handle);
    while let Some(record) = records.next() {
        errors.push(OdbcError {
            state: record.state.as_str().to_owned(),
            code: record.native_error,
            message: slice_to_cow_utf8(&record.message).into_owned(),
        });
    }
    errors
}

/// What `odbc-api` kept when the handle is no longer reachable.
fn reported_by(error: &odbc_api::Error) -> Vec<OdbcError> {
    match error {
        odbc_api::Error::Diagnostics { record, .. } => vec![OdbcError {
            state: record.state.as_str().to_owned(),
            code: record.native_error,
            message: slice_to_cow_utf8(&record.message).into_owned(),
        }],
        other => vec![OdbcError {
            state: String::new(),
            code: 0,
            message: other.to_string(),
        }],
    }
}

/// Never let a failure reach JavaScript with an empty `odbcErrors`, which the
/// C++ addon did whenever `SQL_DIAG_NUMBER` itself failed.
pub fn or_placeholder(errors: Vec<OdbcError>) -> Vec<OdbcError> {
    if !errors.is_empty() {
        return errors;
    }
    vec![OdbcError {
        state: String::new(),
        code: 0,
        message: NO_DIAGNOSTICS.to_owned(),
    }]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keeps_reported_records() {
        let errors = or_placeholder(vec![OdbcError {
            state: "08S01".to_owned(),
            code: 42,
            message: "gone".to_owned(),
        }]);
        assert_eq!(errors.len(), 1);
        assert_eq!(errors[0].state, "08S01");
    }

    #[test]
    fn substitutes_a_placeholder_for_a_silent_driver() {
        let errors = or_placeholder(Vec::new());
        assert_eq!(errors.len(), 1);
        assert_eq!(errors[0].message, NO_DIAGNOSTICS);
        assert!(errors[0].state.is_empty());
    }

    #[test]
    fn describes_a_non_diagnostic_failure() {
        let errors = reported_by(&odbc_api::Error::FailedAllocatingEnvironment);
        assert_eq!(errors.len(), 1);
        assert!(errors[0].message.contains("Environment"));
    }
}
