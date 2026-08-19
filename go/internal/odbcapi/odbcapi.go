// Package odbcapi supplements github.com/alexbrainman/odbc/api with the calls
// it does not bind.
//
// The upstream package binds the wide-character entry points. On Unix the C++
// addon this port replaces used the narrow ones and passed UTF-8 bytes, so
// every call that takes a string is bound here in its narrow form; the calls
// reused from upstream take no strings and are identical either way.
package odbcapi

/*
#cgo darwin CFLAGS: -I/opt/homebrew/include -I/usr/local/include
#cgo darwin LDFLAGS: -L/opt/homebrew/lib -L/usr/local/lib -lodbc
#cgo linux LDFLAGS: -lodbc
#cgo freebsd CFLAGS: -I/usr/local/include
#cgo freebsd LDFLAGS: -L/usr/local/lib -lodbc

#include <stdlib.h>
#include <stdint.h>
#include <sql.h>
#include <sqlext.h>

// Several statement and connection attributes take an integer where the
// prototype declares a pointer, which cgo cannot express directly.
SQLRETURN setStmtUIntPtrAttr(SQLHSTMT handle, SQLINTEGER attribute, uintptr_t value, SQLINTEGER length) {
	return SQLSetStmtAttr(handle, attribute, (SQLPOINTER)value, length);
}

SQLRETURN setConnectUIntPtrAttr(SQLHDBC handle, SQLINTEGER attribute, uintptr_t value, SQLINTEGER length) {
	return SQLSetConnectAttr(handle, attribute, (SQLPOINTER)value, length);
}
*/
import "C"

import (
	"unsafe"

	"github.com/alexbrainman/odbc/api"
)

func SQLDriverConnect(connection api.SQLHDBC, connectionString []byte) api.SQLRETURN {
	pointer, length := stringArg(connectionString)
	return api.SQLRETURN(C.SQLDriverConnect(
		C.SQLHDBC(unsafe.Pointer(connection)),
		nil,
		pointer, length,
		nil, 0, nil,
		C.SQL_DRIVER_NOPROMPT,
	))
}

func SQLPrepare(statement api.SQLHSTMT, sql []byte) api.SQLRETURN {
	pointer, _ := stringArg(sql)
	return api.SQLRETURN(C.SQLPrepare(
		C.SQLHSTMT(unsafe.Pointer(statement)),
		pointer,
		C.SQL_NTS,
	))
}

func SQLExecDirect(statement api.SQLHSTMT, sql []byte) api.SQLRETURN {
	pointer, _ := stringArg(sql)
	return api.SQLRETURN(C.SQLExecDirect(
		C.SQLHSTMT(unsafe.Pointer(statement)),
		pointer,
		C.SQL_NTS,
	))
}

// ColumnDescription is the result of SQLDescribeCol.
type ColumnDescription struct {
	Name          string
	DataType      int16
	ColumnSize    uint64
	DecimalDigits int16
	Nullable      int16
}

func SQLDescribeCol(statement api.SQLHSTMT, column uint16, nameLength int) (ColumnDescription, api.SQLRETURN) {
	name := make([]byte, nameLength+1)
	var (
		returnedLength C.SQLSMALLINT
		dataType       C.SQLSMALLINT
		columnSize     C.SQLULEN
		decimalDigits  C.SQLSMALLINT
		nullable       C.SQLSMALLINT
	)

	ret := api.SQLRETURN(C.SQLDescribeCol(
		C.SQLHSTMT(unsafe.Pointer(statement)),
		C.SQLUSMALLINT(column),
		(*C.SQLCHAR)(unsafe.Pointer(&name[0])),
		C.SQLSMALLINT(len(name)),
		&returnedLength, &dataType, &columnSize, &decimalDigits, &nullable,
	))

	description := ColumnDescription{
		Name:          string(name[:clampLength(int(returnedLength), len(name)-1)]),
		DataType:      int16(dataType),
		ColumnSize:    uint64(columnSize),
		DecimalDigits: int16(decimalDigits),
		Nullable:      int16(nullable),
	}
	return description, ret
}

// DiagnosticRecord is one SQLGetDiagRec entry. TextLength is what the driver
// reported, which callers need in order to detect a truncated message.
type DiagnosticRecord struct {
	State      string
	Code       int32
	Message    string
	TextLength int
}

func SQLGetDiagRec(handleType int16, handle api.SQLHANDLE, record int16, messageBytes int) (DiagnosticRecord, api.SQLRETURN) {
	state := make([]byte, 6)
	// Allocate more than the driver is told it has, so that one ignoring
	// BufferLength writes into our slack rather than past the buffer.
	message := make([]byte, messageBytes+messageBufferSlackBytes)
	var (
		nativeError C.SQLINTEGER
		textLength  C.SQLSMALLINT
	)

	ret := api.SQLRETURN(C.SQLGetDiagRec(
		C.SQLSMALLINT(handleType),
		C.SQLHANDLE(unsafe.Pointer(handle)),
		C.SQLSMALLINT(record),
		(*C.SQLCHAR)(unsafe.Pointer(&state[0])),
		&nativeError,
		(*C.SQLCHAR)(unsafe.Pointer(&message[0])),
		C.SQLSMALLINT(messageBytes),
		&textLength,
	))

	diagnostic := DiagnosticRecord{
		State:      nulTerminated(state),
		Code:       int32(nativeError),
		Message:    nulTerminated(message[:clampLength(int(textLength), messageBytes)]),
		TextLength: int(textLength),
	}
	return diagnostic, ret
}

const messageBufferSlackBytes = 256

func SQLGetDiagFieldRecordCount(handleType int16, handle api.SQLHANDLE) (int32, api.SQLRETURN) {
	var count C.SQLINTEGER
	ret := api.SQLRETURN(C.SQLGetDiagField(
		C.SQLSMALLINT(handleType),
		C.SQLHANDLE(unsafe.Pointer(handle)),
		0,
		C.SQL_DIAG_NUMBER,
		C.SQLPOINTER(unsafe.Pointer(&count)),
		C.SQL_IS_INTEGER,
		nil,
	))
	return int32(count), ret
}

func SQLGetInfoUint16(connection api.SQLHDBC, infoType uint16) (uint16, api.SQLRETURN) {
	var value C.SQLUSMALLINT
	ret := api.SQLRETURN(C.SQLGetInfo(
		C.SQLHDBC(unsafe.Pointer(connection)),
		C.SQLUSMALLINT(infoType),
		C.SQLPOINTER(unsafe.Pointer(&value)),
		C.SQLSMALLINT(unsafe.Sizeof(value)),
		nil,
	))
	return uint16(value), ret
}

func SQLGetInfoUint32(connection api.SQLHDBC, infoType uint16) (uint32, api.SQLRETURN) {
	var value C.SQLUINTEGER
	ret := api.SQLRETURN(C.SQLGetInfo(
		C.SQLHDBC(unsafe.Pointer(connection)),
		C.SQLUSMALLINT(infoType),
		C.SQLPOINTER(unsafe.Pointer(&value)),
		C.SQLSMALLINT(unsafe.Sizeof(value)),
		nil,
	))
	return uint32(value), ret
}

func SQLGetInfoString(connection api.SQLHDBC, infoType uint16, bufferBytes int) (string, api.SQLRETURN) {
	buffer := make([]byte, bufferBytes)
	var length C.SQLSMALLINT
	ret := api.SQLRETURN(C.SQLGetInfo(
		C.SQLHDBC(unsafe.Pointer(connection)),
		C.SQLUSMALLINT(infoType),
		C.SQLPOINTER(unsafe.Pointer(&buffer[0])),
		C.SQLSMALLINT(len(buffer)),
		&length,
	))
	return string(buffer[:clampLength(int(length), len(buffer))]), ret
}

func SQLSetStmtAttrUintPtr(statement api.SQLHSTMT, attribute int32, value uintptr, length int32) api.SQLRETURN {
	return api.SQLRETURN(C.setStmtUIntPtrAttr(
		C.SQLHSTMT(unsafe.Pointer(statement)),
		C.SQLINTEGER(attribute),
		C.uintptr_t(value),
		C.SQLINTEGER(length),
	))
}

func SQLSetStmtAttrPointer(statement api.SQLHSTMT, attribute int32, value unsafe.Pointer, length int32) api.SQLRETURN {
	return api.SQLRETURN(C.SQLSetStmtAttr(
		C.SQLHSTMT(unsafe.Pointer(statement)),
		C.SQLINTEGER(attribute),
		C.SQLPOINTER(value),
		C.SQLINTEGER(length),
	))
}

func SQLGetStmtAttrUint64(statement api.SQLHSTMT, attribute int32) (uint64, api.SQLRETURN) {
	var value C.SQLULEN
	ret := api.SQLRETURN(C.SQLGetStmtAttr(
		C.SQLHSTMT(unsafe.Pointer(statement)),
		C.SQLINTEGER(attribute),
		C.SQLPOINTER(unsafe.Pointer(&value)),
		C.SQL_IS_INTEGER,
		nil,
	))
	return uint64(value), ret
}

func SQLSetConnectAttrUintPtr(connection api.SQLHDBC, attribute int32, value uintptr, length int32) api.SQLRETURN {
	return api.SQLRETURN(C.setConnectUIntPtrAttr(
		C.SQLHDBC(unsafe.Pointer(connection)),
		C.SQLINTEGER(attribute),
		C.uintptr_t(value),
		C.SQLINTEGER(length),
	))
}

func SQLGetConnectAttrUint32(connection api.SQLHDBC, attribute int32) (uint32, api.SQLRETURN) {
	var value C.SQLUINTEGER
	ret := api.SQLRETURN(C.SQLGetConnectAttr(
		C.SQLHDBC(unsafe.Pointer(connection)),
		C.SQLINTEGER(attribute),
		C.SQLPOINTER(unsafe.Pointer(&value)),
		C.SQL_IS_UINTEGER,
		nil,
	))
	return uint32(value), ret
}

func SQLSetCursorName(statement api.SQLHSTMT, name []byte) api.SQLRETURN {
	pointer, length := stringArg(name)
	return api.SQLRETURN(C.SQLSetCursorName(
		C.SQLHSTMT(unsafe.Pointer(statement)),
		pointer,
		C.SQLSMALLINT(length),
	))
}

func SQLSetPos(statement api.SQLHSTMT, row uint64, operation, lock uint16) api.SQLRETURN {
	return api.SQLRETURN(C.SQLSetPos(
		C.SQLHSTMT(unsafe.Pointer(statement)),
		C.SQLSETPOSIROW(row),
		C.SQLUSMALLINT(operation),
		C.SQLUSMALLINT(lock),
	))
}

func SQLFreeStmt(statement api.SQLHSTMT, option uint16) api.SQLRETURN {
	return api.SQLRETURN(C.SQLFreeStmt(
		C.SQLHSTMT(unsafe.Pointer(statement)),
		C.SQLUSMALLINT(option),
	))
}

func SQLTables(statement api.SQLHSTMT, catalog, schema, table, tableType []byte) api.SQLRETURN {
	catalogPointer, catalogLength := stringArg(catalog)
	schemaPointer, schemaLength := stringArg(schema)
	tablePointer, tableLength := stringArg(table)
	typePointer, typeLength := stringArg(tableType)
	return api.SQLRETURN(C.SQLTables(
		C.SQLHSTMT(unsafe.Pointer(statement)),
		catalogPointer, catalogLength,
		schemaPointer, schemaLength,
		tablePointer, tableLength,
		typePointer, typeLength,
	))
}

func SQLColumns(statement api.SQLHSTMT, catalog, schema, table, column []byte) api.SQLRETURN {
	catalogPointer, catalogLength := stringArg(catalog)
	schemaPointer, schemaLength := stringArg(schema)
	tablePointer, tableLength := stringArg(table)
	columnPointer, columnLength := stringArg(column)
	return api.SQLRETURN(C.SQLColumns(
		C.SQLHSTMT(unsafe.Pointer(statement)),
		catalogPointer, catalogLength,
		schemaPointer, schemaLength,
		tablePointer, tableLength,
		columnPointer, columnLength,
	))
}

func SQLPrimaryKeys(statement api.SQLHSTMT, catalog, schema, table []byte) api.SQLRETURN {
	catalogPointer, catalogLength := stringArg(catalog)
	schemaPointer, schemaLength := stringArg(schema)
	tablePointer, tableLength := stringArg(table)
	return api.SQLRETURN(C.SQLPrimaryKeys(
		C.SQLHSTMT(unsafe.Pointer(statement)),
		catalogPointer, catalogLength,
		schemaPointer, schemaLength,
		tablePointer, tableLength,
	))
}

func SQLForeignKeys(statement api.SQLHSTMT, catalog, schema, table, foreignCatalog, foreignSchema, foreignTable []byte) api.SQLRETURN {
	catalogPointer, catalogLength := stringArg(catalog)
	schemaPointer, schemaLength := stringArg(schema)
	tablePointer, tableLength := stringArg(table)
	foreignCatalogPointer, foreignCatalogLength := stringArg(foreignCatalog)
	foreignSchemaPointer, foreignSchemaLength := stringArg(foreignSchema)
	foreignTablePointer, foreignTableLength := stringArg(foreignTable)
	return api.SQLRETURN(C.SQLForeignKeys(
		C.SQLHSTMT(unsafe.Pointer(statement)),
		catalogPointer, catalogLength,
		schemaPointer, schemaLength,
		tablePointer, tableLength,
		foreignCatalogPointer, foreignCatalogLength,
		foreignSchemaPointer, foreignSchemaLength,
		foreignTablePointer, foreignTableLength,
	))
}

func SQLProcedures(statement api.SQLHSTMT, catalog, schema, procedure []byte) api.SQLRETURN {
	catalogPointer, catalogLength := stringArg(catalog)
	schemaPointer, schemaLength := stringArg(schema)
	procedurePointer, procedureLength := stringArg(procedure)
	return api.SQLRETURN(C.SQLProcedures(
		C.SQLHSTMT(unsafe.Pointer(statement)),
		catalogPointer, catalogLength,
		schemaPointer, schemaLength,
		procedurePointer, procedureLength,
	))
}

func SQLProcedureColumns(statement api.SQLHSTMT, catalog, schema, procedure, column []byte) api.SQLRETURN {
	catalogPointer, catalogLength := stringArg(catalog)
	schemaPointer, schemaLength := stringArg(schema)
	procedurePointer, procedureLength := stringArg(procedure)
	columnPointer, columnLength := stringArg(column)
	return api.SQLRETURN(C.SQLProcedureColumns(
		C.SQLHSTMT(unsafe.Pointer(statement)),
		catalogPointer, catalogLength,
		schemaPointer, schemaLength,
		procedurePointer, procedureLength,
		columnPointer, columnLength,
	))
}

// Alloc returns zeroed C memory. Buffers handed to SQLBindCol and
// SQLBindParameter stay live inside the driver after the call returns, so they
// must not be Go allocations.
func Alloc(size int) unsafe.Pointer {
	return C.calloc(1, C.size_t(size))
}

func Realloc(pointer unsafe.Pointer, size int) unsafe.Pointer {
	return C.realloc(pointer, C.size_t(size))
}

func Free(pointer unsafe.Pointer) {
	C.free(pointer)
}

// stringArg maps a nil slice to a NULL pointer, which the catalog functions
// treat differently from an empty string.
func stringArg(value []byte) (*C.SQLCHAR, C.SQLSMALLINT) {
	if value == nil {
		return nil, 0
	}
	return (*C.SQLCHAR)(unsafe.Pointer(&value[0])), C.SQL_NTS
}

func nulTerminated(value []byte) string {
	for index, character := range value {
		if character == 0 {
			return string(value[:index])
		}
	}
	return string(value)
}

func clampLength(length, limit int) int {
	if length < 0 {
		return 0
	}
	if length > limit {
		return limit
	}
	return length
}
