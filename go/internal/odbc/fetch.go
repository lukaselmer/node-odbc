package odbc

import (
	"unsafe"

	"github.com/alexbrainman/odbc/api"
	"github.com/lukaselmer/node-odbc/go/internal/odbcapi"
)

// fetchAll drains the result set and closes the cursor, which is what a query
// without an explicit cursor does.
func (s *statement) fetchAll() ([]any, error) {
	rows := []any{}
	for {
		fetched, done, err := s.fetchBatch()
		if err != nil {
			return nil, err
		}
		rows = append(rows, fetched...)
		if done {
			break
		}
	}

	if err := s.closeCursor(); err != nil {
		return nil, err
	}
	return rows, nil
}

// fetchBatch performs one SQLFetch, which returns up to fetchSize rows.
func (s *statement) fetchBatch() ([]any, bool, error) {
	if len(s.columns) == 0 {
		s.noData = true
		return nil, true, nil
	}

	ret := api.SQLFetch(s.handle)
	if ret == odbcapi.SQLNoData {
		s.noData = true
		return nil, true, nil
	}
	if !odbcapi.Succeeded(int16(ret)) {
		return nil, true, s.newError("[odbc] Error fetching results with SQLFetch")
	}

	rows, err := s.storeFetchedRows()
	if err != nil {
		return nil, true, err
	}
	s.noData = s.reachedEnd()
	return rows, s.noData, nil
}

func (s *statement) storeFetchedRows() ([]any, error) {
	rows := make([]any, 0, s.rowsFetchedCount())
	for index := range s.rowsFetchedCount() {
		if err := s.positionAt(index); err != nil {
			return nil, err
		}
		if !s.rowSucceeded(index) {
			continue
		}
		row, err := s.readRow(index)
		if err != nil {
			return nil, err
		}
		rows = append(rows, row)
	}
	return rows, nil
}

func (s *statement) rowsFetchedCount() int {
	if s.simpleBinding {
		return 1
	}
	return int(*(*api.SQLULEN)(s.rowsFetched))
}

// With a block cursor the driver needs to be told which row SQLGetData should
// read from.
func (s *statement) positionAt(row int) error {
	if !s.hasLongData() || !s.connection.info.getData.block || s.fetchSize <= 1 {
		return nil
	}
	ret := odbcapi.SQLSetPos(s.handle, uint64(row+1), odbcapi.SQLPositionOp, odbcapi.SQLLockNoChange)
	if !odbcapi.Succeeded(int16(ret)) {
		return s.newError("[odbc] Error setting the position in the result set")
	}
	return nil
}

func (s *statement) rowSucceeded(row int) bool {
	if s.simpleBinding || s.rowStatus == nil {
		return true
	}
	status := *(*uint16)(unsafe.Add(s.rowStatus, row*2))
	return status == odbcapi.SQLRowSuccess || status == odbcapi.SQLRowSuccessWithInfo
}

func (s *statement) reachedEnd() bool {
	if s.simpleBinding || s.rowStatus == nil {
		return true
	}
	lastStatus := *(*uint16)(unsafe.Add(s.rowStatus, int(s.fetchSize-1)*2))
	return lastStatus == sqlRowNoRow
}

const sqlRowNoRow = 3

func (s *statement) hasLongData() bool {
	for _, binding := range s.bindings {
		if binding.isLongData {
			return true
		}
	}
	return false
}

// readRow builds one row, either as an object keyed by column name or, when
// fetchArray is set, as a positional array.
func (s *statement) readRow(row int) (any, error) {
	if s.connection.FetchArray() || s.arrayRows {
		values := make([]any, len(s.columns))
		for index := range s.columns {
			value, err := s.readColumn(index, row)
			if err != nil {
				return nil, err
			}
			values[index] = value
		}
		return values, nil
	}

	values := make(map[string]any, len(s.columns))
	for index, column := range s.columns {
		value, err := s.readColumn(index, row)
		if err != nil {
			return nil, err
		}
		values[column.Name] = value
	}
	return values, nil
}

func (s *statement) readColumn(index, row int) (any, error) {
	binding := &s.bindings[index]
	if binding.isLongData {
		return s.readLongColumn(index)
	}
	return convertBoundValue(s.columns[index], binding, row), nil
}

// readLongColumn pulls a value the driver would not fit into a bound buffer,
// growing the buffer until the driver stops reporting more data.
func (s *statement) readLongColumn(index int) (any, error) {
	binding := &s.bindings[index]
	reader := newLongDataReader(s, index, binding.bindType)
	defer reader.free()

	if err := reader.read(); err != nil {
		return nil, err
	}
	if reader.isNull {
		return nil, nil
	}
	return convertLongValue(s.columns[index], binding.bindType, reader.bytes()), nil
}

func (s *statement) closeCursor() error {
	if len(s.columns) == 0 {
		return nil
	}
	ret := api.SQLCloseCursor(s.handle)
	if !odbcapi.Succeeded(int16(ret)) {
		return s.newError("[odbc] Error closing the cursor on the statement")
	}
	return nil
}
