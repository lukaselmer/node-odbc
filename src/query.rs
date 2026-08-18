//! Running statements and collecting result sets.
//!
//! Rows are read one at a time with `SQLGetData` rather than through a bound
//! block-fetch buffer. That is the most portable path ODBC offers — it needs no
//! `SQL_ATTR_ROW_ARRAY_SIZE` support and no row-status array — which matters
//! because the drivers this addon exists for are the ones that reject those.

use crate::error::{OdbcFailure, OdbcResult, or_placeholder};
use crate::value::{CellValue, ColumnInfo, ResultSet, data_type_name};
use odbc_api::handles::Statement as _;
use odbc_api::parameter::InputParameter;
use odbc_api::{Cursor, CursorRow, IntoParameter, Nullability, Nullable, Pod, ResultSetMetadata};

#[derive(Debug, Clone, PartialEq)]
pub enum Parameter {
    Null,
    Text(String),
    Number(f64),
    BigInt(i64),
    Boolean(bool),
    Binary(Vec<u8>),
}

/// Reads the rows, then the row count, which is why the cursor is consumed
/// here: `SQLRowCount` is only meaningful once the result set is done, and for
/// INSERT/UPDATE/DELETE there is no cursor at all.
pub fn collect(cursor: &mut impl Cursor) -> OdbcResult<(Vec<ColumnInfo>, Vec<Vec<CellValue>>)> {
    let columns = describe(cursor)?;
    let rows = fetch_rows(cursor, &columns)?;
    Ok((columns, rows))
}

pub fn describe(cursor: &mut impl ResultSetMetadata) -> OdbcResult<Vec<ColumnInfo>> {
    let count = cursor
        .num_result_cols()
        .map_err(|error| plain(error, "[odbc] Error reading the result set metadata"))?;

    (1..=count as u16)
        .map(|index| describe_column(cursor, index))
        .collect()
}

fn describe_column(cursor: &mut impl ResultSetMetadata, index: u16) -> OdbcResult<ColumnInfo> {
    let name = cursor
        .col_name(index)
        .map_err(|error| plain(error, "[odbc] Error reading a column name"))?;
    let data_type = cursor
        .col_data_type(index)
        .map_err(|error| plain(error, "[odbc] Error reading a column type"))?;
    let nullable = cursor
        .col_nullability(index)
        .map(|nullability| nullability != Nullability::NoNulls)
        .unwrap_or(true);

    let code = data_type.data_type().0;
    Ok(ColumnInfo {
        name,
        data_type: code,
        data_type_name: data_type_name(code).to_owned(),
        column_size: column_size(cursor, index),
        decimal_digits: data_type.decimal_digits(),
        nullable,
    })
}

/// The `ColumnSize` that `SQLDescribeCol` reports.
///
/// `odbc-api` folds this into its `DataType` and drops it for the fixed-width
/// types, and the descriptor field that would carry it is not populated by
/// every driver — psqlodbc reports precision 0 for `INTEGER`. Asking
/// `SQLDescribeCol` is what the C++ addon did and is what drivers implement.
fn column_size(cursor: &mut impl ResultSetMetadata, index: u16) -> u32 {
    let mut column_size: usize = 0;
    let return_code = unsafe {
        odbc_api::sys::SQLDescribeCol(
            cursor.as_stmt_ref().as_sys(),
            index,
            std::ptr::null_mut(),
            0,
            std::ptr::null_mut(),
            std::ptr::null_mut(),
            &mut column_size,
            std::ptr::null_mut(),
            std::ptr::null_mut(),
        )
    };
    if return_code == odbc_api::sys::SqlReturn::ERROR {
        return 0;
    }
    column_size as u32
}

fn fetch_rows(cursor: &mut impl Cursor, columns: &[ColumnInfo]) -> OdbcResult<Vec<Vec<CellValue>>> {
    let mut rows = Vec::new();
    loop {
        let row = cursor
            .next_row()
            .map_err(|error| plain(error, "[odbc] Error fetching a row"))?;
        let Some(mut row) = row else { return Ok(rows) };

        let mut cells = Vec::with_capacity(columns.len());
        for (offset, column) in columns.iter().enumerate() {
            cells.push(read_cell(&mut row, offset as u16 + 1, column)?);
        }
        rows.push(cells);
    }
}

/// Columns are read left to right, which every driver supports; reading them
/// out of order would need `SQL_GD_ANY_ORDER`.
fn read_cell(row: &mut CursorRow<'_>, index: u16, column: &ColumnInfo) -> OdbcResult<CellValue> {
    match column.data_type {
        SQL_BIGINT => read_number(row, index, CellValue::BigInt),
        SQL_TINYINT | SQL_SMALLINT | SQL_INTEGER => {
            read_number(row, index, |value: i32| CellValue::Number(value.into()))
        }
        SQL_REAL | SQL_FLOAT | SQL_DOUBLE => read_number(row, index, CellValue::Number),
        SQL_BINARY | SQL_VARBINARY | SQL_LONGVARBINARY => read_binary(row, index),
        _ => read_text(row, index),
    }
}

/// Decimals and numerics deliberately fall through to the text path: reading
/// them as a double is what loses precision the driver was willing to give.
fn read_number<T: Pod>(
    row: &mut CursorRow<'_>,
    index: u16,
    wrap: impl FnOnce(T) -> CellValue,
) -> OdbcResult<CellValue> {
    let mut value = Nullable::<T>::null();
    row.get_data(index, &mut value)
        .map_err(|error| plain(error, "[odbc] Error reading a column value"))?;
    Ok(value.into_opt().map(wrap).unwrap_or(CellValue::Null))
}

fn read_text(row: &mut CursorRow<'_>, index: u16) -> OdbcResult<CellValue> {
    let mut buffer = Vec::new();
    let present = row
        .get_text(index, &mut buffer)
        .map_err(|error| plain(error, "[odbc] Error reading a column value"))?;
    if !present {
        return Ok(CellValue::Null);
    }
    Ok(CellValue::Text(
        String::from_utf8_lossy(&buffer).into_owned(),
    ))
}

fn read_binary(row: &mut CursorRow<'_>, index: u16) -> OdbcResult<CellValue> {
    let mut buffer = Vec::new();
    let present = row
        .get_binary(index, &mut buffer)
        .map_err(|error| plain(error, "[odbc] Error reading a column value"))?;
    if !present {
        return Ok(CellValue::Null);
    }
    Ok(CellValue::Binary(buffer))
}

pub fn bind(parameters: &[Parameter]) -> Vec<Box<dyn InputParameter>> {
    parameters.iter().map(as_input_parameter).collect()
}

fn as_input_parameter(parameter: &Parameter) -> Box<dyn InputParameter> {
    match parameter {
        Parameter::Null => Box::new(None::<String>.into_parameter()),
        Parameter::Text(text) => Box::new(text.clone().into_parameter()),
        Parameter::Number(value) => Box::new(*value),
        Parameter::BigInt(value) => Box::new(*value),
        Parameter::Boolean(value) => Box::new(odbc_api::Bit(u8::from(*value))),
        Parameter::Binary(bytes) => Box::new(bytes.clone().into_parameter()),
    }
}

pub fn empty_result(sql: Option<String>, row_count: i64) -> ResultSet {
    ResultSet {
        columns: Vec::new(),
        rows: Vec::new(),
        row_count,
        statement: sql,
    }
}

pub fn plain(error: odbc_api::Error, message: &str) -> OdbcFailure {
    let mut failure = OdbcFailure::from_error(error, message);
    failure.errors = or_placeholder(std::mem::take(&mut failure.errors));
    failure
}

const SQL_INTEGER: i16 = 4;
const SQL_SMALLINT: i16 = 5;
const SQL_FLOAT: i16 = 6;
const SQL_REAL: i16 = 7;
const SQL_DOUBLE: i16 = 8;
const SQL_BIGINT: i16 = -5;
const SQL_TINYINT: i16 = -6;
const SQL_BINARY: i16 = -2;
const SQL_VARBINARY: i16 = -3;
const SQL_LONGVARBINARY: i16 = -4;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn binds_one_parameter_per_value() {
        let parameters = vec![
            Parameter::Null,
            Parameter::Text("a".to_owned()),
            Parameter::BigInt(7),
        ];
        assert_eq!(bind(&parameters).len(), 3);
    }

    #[test]
    fn binds_nothing_for_an_empty_list() {
        assert!(bind(&[]).is_empty());
    }

    #[test]
    fn reports_the_row_count_of_a_statement_with_no_result_set() {
        let result = empty_result(Some("DELETE FROM t".to_owned()), 3);
        assert_eq!(result.row_count, 3);
        assert!(result.rows.is_empty());
        assert!(result.columns.is_empty());
    }
}
