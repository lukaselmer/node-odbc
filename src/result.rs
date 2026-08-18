//! Turning a fetched result set into the JavaScript value callers expect.
//!
//! The conversion is written as `ToNapiValue` on owned wrappers rather than as
//! functions returning `Object<'env>`, because a threadsafe callback may not
//! hand back a value that borrows its `Env`.

use crate::error::OdbcFailure;
use crate::value::{CellValue, ColumnInfo, ResultSet};
use napi::bindgen_prelude::*;
use napi::sys;

/// A result set: an `Array` of rows that also carries `count`, `columns`,
/// `statement`, `parameters` and `return`.
pub struct JsResultSet(pub ResultSet);

/// An `Error` carrying the driver's diagnostics as `odbcErrors`.
pub struct JsOdbcError(pub OdbcFailure);

impl ToNapiValue for JsResultSet {
    unsafe fn to_napi_value(raw: sys::napi_env, value: Self) -> Result<sys::napi_value> {
        let env = Env::from_raw(raw);
        let result = value.0;

        let mut rows = env.create_array(result.rows.len() as u32)?;
        for (index, cells) in result.rows.iter().enumerate() {
            rows.set(index as u32, row(&env, &result.columns, cells)?)?;
        }

        let mut object = rows.coerce_to_object()?;
        object.set("count", result.row_count as f64)?;
        object.set("columns", columns(&env, &result.columns)?)?;
        match &result.statement {
            Some(sql) => object.set("statement", sql.as_str())?,
            None => object.set("statement", Null)?,
        }
        object.set("parameters", ())?;
        object.set("return", ())?;

        unsafe { ToNapiValue::to_napi_value(raw, object) }
    }
}

impl ToNapiValue for JsOdbcError {
    unsafe fn to_napi_value(raw: sys::napi_env, value: Self) -> Result<sys::napi_value> {
        let env = Env::from_raw(raw);
        let failure = value.0;

        let mut details = env.create_array(failure.errors.len() as u32)?;
        for (index, error) in failure.errors.iter().enumerate() {
            let mut detail = Object::new(&env)?;
            detail.set("state", error.state.as_str())?;
            detail.set("code", error.code)?;
            detail.set("message", error.message.as_str())?;
            details.set(index as u32, detail)?;
        }

        let error = Error::new(Status::GenericFailure, failure.message);
        let raw_error = unsafe { ToNapiValue::to_napi_value(raw, error)? };
        let mut object = unsafe { Object::from_napi_value(raw, raw_error)? };
        object.set("odbcErrors", details)?;

        unsafe { ToNapiValue::to_napi_value(raw, object) }
    }
}

fn row<'env>(env: &'env Env, columns: &[ColumnInfo], cells: &[CellValue]) -> Result<Object<'env>> {
    let mut row = Object::new(env)?;
    for (column, cell) in columns.iter().zip(cells) {
        set_cell(&mut row, &column.name, cell)?;
    }
    Ok(row)
}

fn set_cell(row: &mut Object, key: &str, cell: &CellValue) -> Result<()> {
    match cell {
        CellValue::Null => row.set(key, Null),
        CellValue::Text(text) => row.set(key, text.as_str()),
        CellValue::Number(value) => row.set(key, *value),
        CellValue::BigInt(value) => row.set(key, BigInt::from(*value)),
        CellValue::Binary(bytes) => row.set(key, Buffer::from(bytes.clone())),
    }
}

fn columns<'env>(env: &'env Env, columns: &[ColumnInfo]) -> Result<Array<'env>> {
    let mut described = env.create_array(columns.len() as u32)?;
    for (index, column) in columns.iter().enumerate() {
        let mut entry = Object::new(env)?;
        entry.set("name", column.name.as_str())?;
        entry.set("dataType", column.data_type as i32)?;
        entry.set("dataTypeName", column.data_type_name.as_str())?;
        entry.set("columnSize", column.column_size)?;
        entry.set("decimalDigits", column.decimal_digits as i32)?;
        entry.set("nullable", column.nullable)?;
        described.set(index as u32, entry)?;
    }
    Ok(described)
}
