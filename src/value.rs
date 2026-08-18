//! The result of a query, in plain Rust, ready to be turned into JavaScript.
//!
//! Fetching happens on the connection thread and conversion happens on the
//! JavaScript thread, so nothing here may hold an ODBC handle.

#[derive(Debug, Clone, PartialEq)]
pub enum CellValue {
    Null,
    Text(String),
    Number(f64),
    BigInt(i64),
    Binary(Vec<u8>),
}

#[derive(Debug, Clone)]
pub struct ColumnInfo {
    pub name: String,
    pub data_type: i16,
    pub data_type_name: String,
    pub column_size: u32,
    pub decimal_digits: i16,
    pub nullable: bool,
}

#[derive(Debug, Default)]
pub struct ResultSet {
    pub columns: Vec<ColumnInfo>,
    pub rows: Vec<Vec<CellValue>>,
    pub row_count: i64,
    pub statement: Option<String>,
}

/// The `dataTypeName` reported for a column, matching the ODBC macro names the
/// C++ addon exposed.
pub fn data_type_name(data_type: i16) -> &'static str {
    match data_type {
        1 => "SQL_CHAR",
        2 => "SQL_NUMERIC",
        3 => "SQL_DECIMAL",
        4 => "SQL_INTEGER",
        5 => "SQL_SMALLINT",
        6 => "SQL_FLOAT",
        7 => "SQL_REAL",
        8 => "SQL_DOUBLE",
        9 => "SQL_DATETIME",
        12 => "SQL_VARCHAR",
        91 => "SQL_TYPE_DATE",
        92 => "SQL_TYPE_TIME",
        93 => "SQL_TYPE_TIMESTAMP",
        -1 => "SQL_LONGVARCHAR",
        -2 => "SQL_BINARY",
        -3 => "SQL_VARBINARY",
        -4 => "SQL_LONGVARBINARY",
        -5 => "SQL_BIGINT",
        -6 => "SQL_TINYINT",
        -7 => "SQL_BIT",
        -8 => "SQL_WCHAR",
        -9 => "SQL_WVARCHAR",
        -10 => "SQL_WLONGVARCHAR",
        _ => "UNKNOWN",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn names_the_common_data_types() {
        assert_eq!(data_type_name(12), "SQL_VARCHAR");
        assert_eq!(data_type_name(-5), "SQL_BIGINT");
        assert_eq!(data_type_name(4), "SQL_INTEGER");
    }

    #[test]
    fn falls_back_for_a_driver_specific_type() {
        assert_eq!(data_type_name(1234), "UNKNOWN");
    }
}
