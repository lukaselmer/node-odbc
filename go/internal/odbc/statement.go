package odbc

import (
	"unsafe"

	"github.com/alexbrainman/odbc/api"
	"github.com/lukaselmer/node-odbc/go/internal/odbcapi"
)

type QueryOptions struct {
	UseCursor         bool
	CursorName        string
	FetchSize         uint64
	Timeout           uint64
	InitialBufferSize int
}

const (
	defaultFetchSize         = 1
	defaultInitialBufferSize = 1048576
)

// Result is the array-with-properties the addon handed to JavaScript.
type Result struct {
	Rows       []any    `json:"rows"`
	Count      int64    `json:"count"`
	Columns    []Column `json:"columns"`
	Statement  *string  `json:"statement"`
	Parameters []any    `json:"parameters,omitempty"`
}

// statement owns one SQLHSTMT together with the buffers bound to it.
type statement struct {
	connection    *Connection
	handle        api.SQLHSTMT
	sql           string
	options       QueryOptions
	fetchSize     uint64
	simpleBinding bool
	columns       []Column
	bindings      []columnBinding
	parameters    []*parameter
	rowCount      int64
	rowsFetched   unsafe.Pointer
	rowStatus     unsafe.Pointer
	arrayRows     bool
	noData        bool
}

func newStatement(connection *Connection, options QueryOptions) (*statement, error) {
	var handle api.SQLHANDLE

	if connection.handle == nil {
		return nil, newErrorWithoutDiagnostics(
			"[odbc] Database connection handle was no longer valid. Cannot run a query after closing the connection.",
		)
	}

	handleMutex.Lock()
	ret := api.SQLAllocHandle(odbcapi.SQLHandleStmt, api.SQLHANDLE(connection.handle), &handle)
	handleMutex.Unlock()

	if !odbcapi.Succeeded(int16(ret)) {
		return nil, newError(
			"[odbc] Error allocating a handle to run the SQL statement",
			odbcapi.SQLHandleDbc,
			api.SQLHANDLE(connection.handle),
		)
	}

	return &statement{
		connection:  connection,
		handle:      api.SQLHSTMT(handle),
		options:     options,
		fetchSize:   effectiveFetchSize(options),
		rowsFetched: odbcapi.Alloc(sqlUlenSize),
	}, nil
}

func effectiveFetchSize(options QueryOptions) uint64 {
	if options.FetchSize > 0 {
		return options.FetchSize
	}
	return defaultFetchSize
}

func (s *statement) initialBufferSize() int {
	if s.options.InitialBufferSize > 0 {
		return s.options.InitialBufferSize
	}
	return defaultInitialBufferSize
}

// Query runs a statement and, unless a cursor was requested, drains it.
func (c *Connection) Query(sql string, parameters []any, options QueryOptions) (*Result, *Cursor, error) {
	statement, err := newStatement(c, options)
	if err != nil {
		return nil, nil, err
	}
	statement.sql = sql

	result, cursor, err := statement.runQuery(parameters)
	if err != nil || cursor != nil {
		if err != nil {
			statement.free()
		}
		return nil, cursor, err
	}

	statement.free()
	return result, nil, nil
}

func (s *statement) runQuery(parameters []any) (*Result, *Cursor, error) {
	if err := s.applyTimeout(); err != nil {
		return nil, nil, err
	}
	if err := s.execute(parameters); err != nil {
		return nil, nil, err
	}
	if err := s.applyCursorName(); err != nil {
		return nil, nil, err
	}
	if err := s.prepareForFetch(); err != nil {
		return nil, nil, err
	}

	if s.options.UseCursor {
		return nil, newOwningCursor(s), nil
	}

	rows, err := s.fetchAll()
	if err != nil {
		return nil, nil, err
	}
	return s.newResult(rows, parameters), nil, nil
}

func (s *statement) execute(parameters []any) error {
	if len(parameters) > 0 {
		return s.executePrepared(parameters)
	}
	return s.executeDirect()
}

func (s *statement) executeDirect() error {
	ret := odbcapi.SQLExecDirect(s.handle, nulTerminated(s.sql))
	if !odbcapi.Succeeded(int16(ret)) && ret != odbcapi.SQLNoData {
		return s.newError("[odbc] Error executing the sql statement")
	}
	return nil
}

func (s *statement) executePrepared(parameters []any) error {
	if err := s.prepare("[odbc] Error preparing the SQL statement"); err != nil {
		return err
	}

	markerCount, err := s.parameterMarkerCount()
	if err != nil {
		return err
	}
	if markerCount != len(parameters) {
		return newErrorWithoutDiagnostics(
			"[odbc] The number of parameter markers in the statement does not equal the number of bind values passed to the function.",
		)
	}

	if err := s.bindParameters(parameters); err != nil {
		return err
	}

	ret := api.SQLExecute(s.handle)
	if !odbcapi.Succeeded(int16(ret)) && ret != odbcapi.SQLNoData {
		return s.newError("[odbc] Error executing the sql statement")
	}
	return nil
}

func (s *statement) prepare(message string) error {
	ret := odbcapi.SQLPrepare(s.handle, nulTerminated(s.sql))
	if !odbcapi.Succeeded(int16(ret)) {
		return s.newError(message)
	}
	return nil
}

func (s *statement) parameterMarkerCount() (int, error) {
	var count api.SQLSMALLINT
	ret := api.SQLNumParams(s.handle, &count)
	if !odbcapi.Succeeded(int16(ret)) {
		return 0, s.newError("[odbc] Error getting information about the number of parameter markers in the statement")
	}
	return int(count), nil
}

func (s *statement) applyTimeout() error {
	if s.options.Timeout == 0 {
		return nil
	}

	ret := odbcapi.SQLSetStmtAttrUintPtr(s.handle, odbcapi.SQLAttrQueryTimeout, uintptr(s.options.Timeout), 0)
	if !odbcapi.Succeeded(int16(ret)) {
		return s.newError("[odbc] Error setting the query timeout on the statement")
	}
	if ret == odbcapi.SQLSuccessWithInfo {
		if timeout, ret := odbcapi.SQLGetStmtAttrUint64(s.handle, odbcapi.SQLAttrQueryTimeout); odbcapi.Succeeded(int16(ret)) {
			s.options.Timeout = timeout
		}
	}
	return nil
}

func (s *statement) applyCursorName() error {
	if !s.options.UseCursor || s.options.CursorName == "" {
		return nil
	}
	ret := odbcapi.SQLSetCursorName(s.handle, nulTerminated(s.options.CursorName))
	if !odbcapi.Succeeded(int16(ret)) {
		return s.newError("[odbc] Error setting the cursor name on the statement")
	}
	return nil
}

func (s *statement) prepareForFetch() error {
	if err := s.applyFetchSize(); err != nil {
		return err
	}
	if err := s.readRowCount(); err != nil {
		return err
	}
	return s.bindColumns()
}

// A driver may substitute a row-array size it cannot honour and report 01S02.
func (s *statement) applyFetchSize() error {
	ret := odbcapi.SQLSetStmtAttrUintPtr(s.handle, odbcapi.SQLAttrRowArraySize, uintptr(s.fetchSize), 0)
	if !odbcapi.Succeeded(int16(ret)) {
		if !s.toleratesUnsupportedAttribute() {
			return s.newError("[odbc] Error setting the fetch size on the statement")
		}
		s.simpleBinding = true
		return nil
	}

	if ret == odbcapi.SQLSuccessWithInfo && hasState(odbcapi.SQLHandleStmt, api.SQLHANDLE(s.handle), "01S02") {
		s.readSubstitutedFetchSize()
	}
	return s.bindRowStatusArray()
}

func (s *statement) bindRowStatusArray() error {
	s.rowStatus = odbcapi.Alloc(int(s.fetchSize) * 2)
	ret := odbcapi.SQLSetStmtAttrPointer(s.handle, odbcapi.SQLAttrRowStatusPtr, s.rowStatus, 0)
	if !odbcapi.Succeeded(int16(ret)) {
		if s.toleratesUnsupportedAttribute() {
			s.simpleBinding = true
			return nil
		}
		return s.newError("[odbc] Error setting the row status pointer on the statement")
	}
	return nil
}

func (s *statement) readSubstitutedFetchSize() {
	if size, ret := odbcapi.SQLGetStmtAttrUint64(s.handle, odbcapi.SQLAttrRowArraySize); odbcapi.Succeeded(int16(ret)) && size > 0 {
		s.fetchSize = size
	}
}

func (s *statement) readRowCount() error {
	var count api.SQLLEN
	ret := api.SQLRowCount(s.handle, &count)
	if !odbcapi.Succeeded(int16(ret)) {
		return s.newError("[odbc] Error retrieving the row count of the result set")
	}
	s.rowCount = int64(count)
	return nil
}

func (s *statement) newResult(rows []any, parameters []any) *Result {
	sql := s.sql
	return &Result{
		Rows:       rows,
		Count:      s.rowCount,
		Columns:    s.columnsOrEmpty(),
		Statement:  &sql,
		Parameters: parametersOrEmpty(parameters),
	}
}

func (s *statement) columnsOrEmpty() []Column {
	if s.columns == nil {
		return []Column{}
	}
	return s.columns
}

func parametersOrEmpty(parameters []any) []any {
	if parameters == nil {
		return []any{}
	}
	return parameters
}

func (s *statement) newError(message string) *Error {
	return newError(message, odbcapi.SQLHandleStmt, api.SQLHANDLE(s.handle))
}

// Cancel is called from outside the connection's goroutine, which is the
// documented way to interrupt a driver that is blocked inside a call.
func (s *statement) cancel() error {
	ret := api.SQLCancel(s.handle)
	if !odbcapi.Succeeded(int16(ret)) {
		return s.newError("[odbc] Error canceling the statement")
	}
	return nil
}

// releaseBuffers drops everything tied to one execution while keeping the
// statement handle, so that a prepared statement can be executed again.
func (s *statement) releaseBuffers() {
	// The driver still holds the pointers handed to it by SQLBindCol. Freeing
	// the buffers while it does makes the next execute or fetch write into
	// released memory, so tell it to forget them first.
	if s.handle != nil && len(s.bindings) > 0 {
		odbcapi.SQLFreeStmt(s.handle, odbcapi.SQLUnbind)
	}

	for index := range s.bindings {
		s.bindings[index].free()
	}
	s.bindings = nil
	s.columns = nil

	if s.rowStatus != nil {
		odbcapi.Free(s.rowStatus)
		s.rowStatus = nil
	}
}

func (s *statement) free() {
	s.releaseBuffers()

	for _, parameter := range s.parameters {
		parameter.free()
	}
	s.parameters = nil

	if s.rowsFetched != nil {
		odbcapi.Free(s.rowsFetched)
		s.rowsFetched = nil
	}
	if s.handle != nil {
		handleMutex.Lock()
		api.SQLFreeHandle(odbcapi.SQLHandleStmt, api.SQLHANDLE(s.handle))
		handleMutex.Unlock()
		s.handle = nil
	}
}
