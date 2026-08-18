package odbc

import (
	"strconv"

	"github.com/alexbrainman/odbc/api"
	"github.com/lukaselmer/node-odbc/go/internal/odbcapi"
)

// Statement is a prepared statement: the SQL is compiled once and executed
// repeatedly with different parameters.
type Statement struct {
	statement      *statement
	prepared       bool
	parameterCount int
	boundValues    []any
}

func (c *Connection) CreateStatement() (*Statement, error) {
	statement, err := newStatement(c, QueryOptions{})
	if err != nil {
		return nil, newError(
			"[odbc] Error allocating a handle to create a new Statement",
			odbcapi.SQLHandleDbc,
			api.SQLHANDLE(c.handle),
		)
	}
	return &Statement{statement: statement}, nil
}

func (s *Statement) Prepare(sql string) error {
	s.statement.sql = sql
	if err := s.statement.prepare("[odbc] Error preparing the statement"); err != nil {
		return err
	}

	count, err := s.statement.parameterMarkerCount()
	if err != nil {
		return newError(
			"[odbc] Error retrieving number of parameter markers to be bound to the statement",
			odbcapi.SQLHandleStmt,
			api.SQLHANDLE(s.statement.handle),
		)
	}
	s.parameterCount = count
	s.prepared = true
	return nil
}

func (s *Statement) Bind(values []any) error {
	if !s.prepared || len(values) != s.parameterCount {
		return newErrorWithoutDiagnostics(parameterCountMismatchMessage(s.parameterCount, len(values)))
	}

	if err := s.statement.bindParameters(values); err != nil {
		return err
	}
	s.boundValues = values
	return nil
}

func parameterCountMismatchMessage(expected, actual int) string {
	return "[odbc] The prepared statement takes " + strconv.Itoa(expected) +
		" parameters, but " + strconv.Itoa(actual) + " were passed to bind."
}

func (s *Statement) Execute(options QueryOptions) (*Result, *Cursor, error) {
	s.statement.options = options
	s.statement.fetchSize = effectiveFetchSize(options)
	s.statement.releaseBuffers()
	s.statement.noData = false

	if err := s.statement.applyTimeout(); err != nil {
		return nil, nil, err
	}
	if err := s.executeStatement(); err != nil {
		return nil, nil, err
	}
	if err := s.statement.applyCursorName(); err != nil {
		return nil, nil, err
	}
	if err := s.statement.prepareForFetch(); err != nil {
		return nil, nil, err
	}

	if options.UseCursor {
		return nil, newBorrowingCursor(s.statement, s.boundValues), nil
	}

	rows, err := s.statement.fetchAll()
	if err != nil {
		return nil, nil, err
	}
	return s.statement.newResult(rows, s.boundValues), nil, nil
}

func (s *Statement) executeStatement() error {
	ret := api.SQLExecute(s.statement.handle)
	if !odbcapi.Succeeded(int16(ret)) && ret != odbcapi.SQLNoData {
		return s.statement.newError("[odbc] Error executing the statement")
	}
	return nil
}

func (s *Statement) Cancel() error {
	return s.statement.cancel()
}

func (s *Statement) Close() error {
	if s.statement.handle == nil {
		return nil
	}
	handleMutex.Lock()
	ret := api.SQLFreeHandle(odbcapi.SQLHandleStmt, api.SQLHANDLE(s.statement.handle))
	handleMutex.Unlock()

	if !odbcapi.Succeeded(int16(ret)) {
		return s.statement.newError("[odbc] Error closing the statement")
	}
	s.statement.handle = nil
	s.statement.free()
	return nil
}
