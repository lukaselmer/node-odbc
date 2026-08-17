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
	return nil
}

func (s *Statement) Bind(values []any) error {
	if len(values) != s.parameterCount {
		return newErrorWithoutDiagnostics(parameterCountMismatchMessage(s.parameterCount, len(values)))
	}

	if err := s.statement.bindParameters(values); err != nil {
		return err
	}
	s.boundValues = values
	return nil
}

// The trailing brace is what the addon emitted; it is kept so that callers
// matching on the message keep working.
func parameterCountMismatchMessage(expected, actual int) string {
	return "[node-odbc] Error in Statement::BindAsyncWorker::Bind: The number of parameters in the prepared statement (" +
		strconv.Itoa(expected) + ") doesn't match the number of parameters passed to bind (" + strconv.Itoa(actual) + "}."
}

func (s *Statement) Execute(options QueryOptions) (*Result, *Cursor, error) {
	s.statement.options = options
	s.statement.fetchSize = effectiveFetchSize(options)

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
		cursor := newCursor(s.statement)
		cursor.parameters = s.boundValues
		return nil, cursor, nil
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
	ret := api.SQLFreeHandle(odbcapi.SQLHandleStmt, api.SQLHANDLE(s.statement.handle))
	if !odbcapi.Succeeded(int16(ret)) {
		return s.statement.newError("[odbc] Error closing the Statement")
	}
	s.statement.handle = nil
	s.statement.free()
	return nil
}

