package odbc

import "github.com/lukaselmer/node-odbc/go/internal/odbcapi"

// dataTypeName spells a SQL type the way the ODBC headers do, which is what
// `result.columns[].dataTypeName` exposes.
func dataTypeName(dataType int16) string {
	if name, known := dataTypeNames[dataType]; known {
		return name
	}
	return "UNKNOWN"
}

var dataTypeNames = map[int16]string{
	odbcapi.SQLChar:                    "SQL_CHAR",
	odbcapi.SQLVarchar:                 "SQL_VARCHAR",
	odbcapi.SQLLongvarchar:             "SQL_LONGVARCHAR",
	odbcapi.SQLWchar:                   "SQL_WCHAR",
	odbcapi.SQLWvarchar:                "SQL_WVARCHAR",
	odbcapi.SQLWlongvarchar:            "SQL_WLONGVARCHAR",
	odbcapi.SQLDecimal:                 "SQL_DECIMAL",
	odbcapi.SQLNumeric:                 "SQL_NUMERIC",
	odbcapi.SQLSmallint:                "SQL_SMALLINT",
	odbcapi.SQLInteger:                 "SQL_INTEGER",
	odbcapi.SQLReal:                    "SQL_REAL",
	odbcapi.SQLFloat:                   "SQL_FLOAT",
	odbcapi.SQLDouble:                  "SQL_DOUBLE",
	odbcapi.SQLBit:                     "SQL_BIT",
	odbcapi.SQLTinyint:                 "SQL_TINYINT",
	odbcapi.SQLBigint:                  "SQL_BIGINT",
	odbcapi.SQLBinary:                  "SQL_BINARY",
	odbcapi.SQLVarbinary:               "SQL_VARBINARY",
	odbcapi.SQLLongvarbinary:           "SQL_LONGVARBINARY",
	odbcapi.SQLTypeDate:                "SQL_TYPE_DATE",
	odbcapi.SQLTypeTime:                "SQL_TYPE_TIME",
	odbcapi.SQLTypeTimestamp:           "SQL_TYPE_TIMESTAMP",
	odbcapi.SQLIntervalMonth:           "SQL_INTERVAL_MONTH",
	odbcapi.SQLIntervalYear:            "SQL_INTERVAL_YEAR",
	odbcapi.SQLIntervalYearToMonth:     "SQL_INTERVAL_YEAR_TO_MONTH",
	odbcapi.SQLIntervalDay:             "SQL_INTERVAL_DAY",
	odbcapi.SQLIntervalHour:            "SQL_INTERVAL_HOUR",
	odbcapi.SQLIntervalMinute:          "SQL_INTERVAL_MINUTE",
	odbcapi.SQLIntervalSecond:          "SQL_INTERVAL_SECOND",
	odbcapi.SQLIntervalDayToHour:       "SQL_INTERVAL_DAY_TO_HOUR",
	odbcapi.SQLIntervalDayToMinute:     "SQL_INTERVAL_DAY_TO_MINUTE",
	odbcapi.SQLIntervalDayToSecond:     "SQL_INTERVAL_DAY_TO_SECOND",
	odbcapi.SQLIntervalHourToMinute:    "SQL_INTERVAL_HOUR_TO_MINUTE",
	odbcapi.SQLIntervalHourToSecond:    "SQL_INTERVAL_HOUR_TO_SECOND",
	odbcapi.SQLIntervalMinuteToSecond:  "SQL_INTERVAL_MINUTE_TO_SECOND",
	odbcapi.SQLGuid:                    "SQL_GUID",
}
