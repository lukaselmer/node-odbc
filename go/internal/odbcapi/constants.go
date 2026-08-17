package odbcapi

/*
#cgo darwin CFLAGS: -I/opt/homebrew/include -I/usr/local/include
#cgo freebsd CFLAGS: -I/usr/local/include
#include <sql.h>
#include <sqlext.h>
*/
import "C"

// Return codes.
const (
	SQLSuccess         = C.SQL_SUCCESS
	SQLSuccessWithInfo = C.SQL_SUCCESS_WITH_INFO
	SQLNoData          = C.SQL_NO_DATA
	SQLError           = C.SQL_ERROR
	SQLInvalidHandle   = C.SQL_INVALID_HANDLE
	SQLStillExecuting  = C.SQL_STILL_EXECUTING
	SQLNeedData        = C.SQL_NEED_DATA
)

// Indicator values.
const (
	SQLNullData = C.SQL_NULL_DATA
	SQLNoTotal  = C.SQL_NO_TOTAL
	SQLNTS      = C.SQL_NTS
)

// Handle types.
const (
	SQLHandleEnv  = C.SQL_HANDLE_ENV
	SQLHandleDbc  = C.SQL_HANDLE_DBC
	SQLHandleStmt = C.SQL_HANDLE_STMT
)

// Environment, connection and statement attributes.
const (
	SQLAttrOdbcVersion       = C.SQL_ATTR_ODBC_VERSION
	SQLOvOdbc3               = C.SQL_OV_ODBC3
	SQLAttrConnectionTimeout = C.SQL_ATTR_CONNECTION_TIMEOUT
	SQLAttrLoginTimeout      = C.SQL_ATTR_LOGIN_TIMEOUT
	SQLAttrAutocommit        = C.SQL_ATTR_AUTOCOMMIT
	SQLAttrTxnIsolation      = C.SQL_ATTR_TXN_ISOLATION
	SQLAutocommitOff         = C.SQL_AUTOCOMMIT_OFF
	SQLAutocommitOn          = C.SQL_AUTOCOMMIT_ON

	SQLAttrQueryTimeout   = C.SQL_ATTR_QUERY_TIMEOUT
	SQLAttrRowArraySize   = C.SQL_ATTR_ROW_ARRAY_SIZE
	SQLAttrRowBindType    = C.SQL_ATTR_ROW_BIND_TYPE
	SQLAttrRowsFetchedPtr = C.SQL_ATTR_ROWS_FETCHED_PTR
	SQLAttrRowStatusPtr   = C.SQL_ATTR_ROW_STATUS_PTR
	SQLBindByColumn       = C.SQL_BIND_BY_COLUMN

	SQLIsUinteger = C.SQL_IS_UINTEGER
	SQLIsInteger  = C.SQL_IS_INTEGER
	SQLIsPointer  = C.SQL_IS_POINTER
)

// Transactions, cursors and positioning.
const (
	SQLCommit       = C.SQL_COMMIT
	SQLRollback     = C.SQL_ROLLBACK
	SQLCloseCursor  = C.SQL_CLOSE
	SQLDropStmt     = C.SQL_DROP
	SQLUnbind       = C.SQL_UNBIND
	SQLResetParams  = C.SQL_RESET_PARAMS
	SQLPositionOp   = C.SQL_POSITION
	SQLLockNoChange = C.SQL_LOCK_NO_CHANGE

	SQLRowSuccess         = C.SQL_ROW_SUCCESS
	SQLRowSuccessWithInfo = C.SQL_ROW_SUCCESS_WITH_INFO
)

// SQLGetInfo types and their flags.
const (
	SQLMaxColumnNameLen   = C.SQL_MAX_COLUMN_NAME_LEN
	SQLTxnIsolationOption = C.SQL_TXN_ISOLATION_OPTION
	SQLGetdataExtensions  = C.SQL_GETDATA_EXTENSIONS
	SQLUserName           = C.SQL_USER_NAME

	SQLGdAnyColumn = C.SQL_GD_ANY_COLUMN
	SQLGdAnyOrder  = C.SQL_GD_ANY_ORDER
	SQLGdBlock     = C.SQL_GD_BLOCK
	SQLGdBound     = C.SQL_GD_BOUND
)

// SQL data types.
const (
	SQLChar          = C.SQL_CHAR
	SQLVarchar       = C.SQL_VARCHAR
	SQLLongvarchar   = C.SQL_LONGVARCHAR
	SQLWchar         = C.SQL_WCHAR
	SQLWvarchar      = C.SQL_WVARCHAR
	SQLWlongvarchar  = C.SQL_WLONGVARCHAR
	SQLDecimal       = C.SQL_DECIMAL
	SQLNumeric       = C.SQL_NUMERIC
	SQLSmallint      = C.SQL_SMALLINT
	SQLInteger       = C.SQL_INTEGER
	SQLReal          = C.SQL_REAL
	SQLFloat         = C.SQL_FLOAT
	SQLDouble        = C.SQL_DOUBLE
	SQLBit           = C.SQL_BIT
	SQLTinyint       = C.SQL_TINYINT
	SQLBigint        = C.SQL_BIGINT
	SQLBinary        = C.SQL_BINARY
	SQLVarbinary     = C.SQL_VARBINARY
	SQLLongvarbinary = C.SQL_LONGVARBINARY
	SQLTypeDate      = C.SQL_TYPE_DATE
	SQLTypeTime      = C.SQL_TYPE_TIME
	SQLTypeTimestamp = C.SQL_TYPE_TIMESTAMP
	SQLGuid          = C.SQL_GUID

	SQLIntervalYear           = C.SQL_INTERVAL_YEAR
	SQLIntervalMonth          = C.SQL_INTERVAL_MONTH
	SQLIntervalDay            = C.SQL_INTERVAL_DAY
	SQLIntervalHour           = C.SQL_INTERVAL_HOUR
	SQLIntervalMinute         = C.SQL_INTERVAL_MINUTE
	SQLIntervalSecond         = C.SQL_INTERVAL_SECOND
	SQLIntervalYearToMonth    = C.SQL_INTERVAL_YEAR_TO_MONTH
	SQLIntervalDayToHour      = C.SQL_INTERVAL_DAY_TO_HOUR
	SQLIntervalDayToMinute    = C.SQL_INTERVAL_DAY_TO_MINUTE
	SQLIntervalDayToSecond    = C.SQL_INTERVAL_DAY_TO_SECOND
	SQLIntervalHourToMinute   = C.SQL_INTERVAL_HOUR_TO_MINUTE
	SQLIntervalHourToSecond   = C.SQL_INTERVAL_HOUR_TO_SECOND
	SQLIntervalMinuteToSecond = C.SQL_INTERVAL_MINUTE_TO_SECOND
)

// C data types used when binding columns and parameters.
const (
	SQLCDefault = C.SQL_C_DEFAULT
	SQLCChar    = C.SQL_C_CHAR
	SQLCWchar   = C.SQL_C_WCHAR
	SQLCBinary  = C.SQL_C_BINARY
	SQLCBit     = C.SQL_C_BIT
	SQLCShort   = C.SQL_C_SHORT
	SQLCSshort  = C.SQL_C_SSHORT
	SQLCUshort  = C.SQL_C_USHORT
	SQLCLong    = C.SQL_C_LONG
	SQLCSlong   = C.SQL_C_SLONG
	SQLCUlong   = C.SQL_C_ULONG
	SQLCFloat   = C.SQL_C_FLOAT
	SQLCDouble  = C.SQL_C_DOUBLE
	SQLCSbigint = C.SQL_C_SBIGINT
	SQLCUbigint = C.SQL_C_UBIGINT
)

// Parameter direction.
const (
	SQLParamInput       = C.SQL_PARAM_INPUT
	SQLParamInputOutput = C.SQL_PARAM_INPUT_OUTPUT
	SQLParamOutput      = C.SQL_PARAM_OUTPUT
)

// Isolation levels.
const (
	SQLTxnReadUncommitted = C.SQL_TXN_READ_UNCOMMITTED
	SQLTxnReadCommitted   = C.SQL_TXN_READ_COMMITTED
	SQLTxnRepeatableRead  = C.SQL_TXN_REPEATABLE_READ
	SQLTxnSerializable    = C.SQL_TXN_SERIALIZABLE
)

const ODBCVer = C.ODBCVER

func Succeeded(returnCode int16) bool {
	return returnCode == SQLSuccess || returnCode == SQLSuccessWithInfo
}
