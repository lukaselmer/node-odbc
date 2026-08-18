pub const ODBC_CONSTANTS: &[(&str, i64)] = &[
    ("ODBCVER", 0x0380),
    ("SQL_COMMIT", 0),
    ("SQL_ROLLBACK", 1),
    ("SQL_USER_NAME", 47),
    ("SQL_PARAM_INPUT", 1),
    ("SQL_PARAM_INPUT_OUTPUT", 2),
    ("SQL_PARAM_OUTPUT", 4),
    ("SQL_CHAR", 1),
    ("SQL_VARCHAR", 12),
    ("SQL_LONGVARCHAR", -1),
    ("SQL_WCHAR", -8),
    ("SQL_WVARCHAR", -9),
    ("SQL_WLONGVARCHAR", -10),
    ("SQL_DECIMAL", 3),
    ("SQL_NUMERIC", 2),
    ("SQL_SMALLINT", 5),
    ("SQL_INTEGER", 4),
    ("SQL_REAL", 7),
    ("SQL_FLOAT", 6),
    ("SQL_DOUBLE", 8),
    ("SQL_BIT", -7),
    ("SQL_TINYINT", -6),
    ("SQL_BIGINT", -5),
    ("SQL_BINARY", -2),
    ("SQL_VARBINARY", -3),
    ("SQL_LONGVARBINARY", -4),
    ("SQL_TYPE_DATE", 91),
    ("SQL_TYPE_TIME", 92),
    ("SQL_TYPE_TIMESTAMP", 93),
    ("SQL_INTERVAL_MONTH", 102),
    ("SQL_INTERVAL_YEAR", 101),
    ("SQL_INTERVAL_YEAR_TO_MONTH", 107),
    ("SQL_INTERVAL_DAY", 103),
    ("SQL_INTERVAL_HOUR", 104),
    ("SQL_INTERVAL_MINUTE", 105),
    ("SQL_INTERVAL_SECOND", 106),
    ("SQL_INTERVAL_DAY_TO_HOUR", 108),
    ("SQL_INTERVAL_DAY_TO_MINUTE", 109),
    ("SQL_INTERVAL_DAY_TO_SECOND", 110),
    ("SQL_INTERVAL_HOUR_TO_MINUTE", 111),
    ("SQL_INTERVAL_HOUR_TO_SECOND", 112),
    ("SQL_INTERVAL_MINUTE_TO_SECOND", 113),
    ("SQL_GUID", -11),
    ("SQL_NO_NULLS", 0),
    ("SQL_NULLABLE", 1),
    ("SQL_NULLABLE_UNKNOWN", 2),
    ("SQL_TXN_READ_UNCOMMITTED", 1),
    ("SQL_TRANSACTION_READ_UNCOMMITTED", 1),
    ("SQL_TXN_READ_COMMITTED", 2),
    ("SQL_TRANSACTION_READ_COMMITTED", 2),
    ("SQL_TXN_REPEATABLE_READ", 4),
    ("SQL_TRANSACTION_REPEATABLE_READ", 4),
    ("SQL_TXN_SERIALIZABLE", 8),
    ("SQL_TRANSACTION_SERIALIZABLE", 8),
];

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashSet;

    #[test]
    fn has_no_duplicate_names() {
        let names: HashSet<&str> = ODBC_CONSTANTS.iter().map(|(name, _)| *name).collect();
        assert_eq!(names.len(), ODBC_CONSTANTS.len());
    }

    #[test]
    fn has_well_known_values() {
        let value_of = |name: &str| {
            ODBC_CONSTANTS
                .iter()
                .find(|(n, _)| *n == name)
                .map(|(_, v)| *v)
                .unwrap_or_else(|| panic!("missing constant: {name}"))
        };

        assert_eq!(value_of("SQL_CHAR"), 1);
        assert_eq!(value_of("SQL_VARCHAR"), 12);
        assert_eq!(value_of("SQL_LONGVARCHAR"), -1);
        assert_eq!(value_of("SQL_COMMIT"), 0);
        assert_eq!(value_of("SQL_ROLLBACK"), 1);
    }
}
