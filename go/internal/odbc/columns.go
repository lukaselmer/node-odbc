package odbc

import (
	"unsafe"

	"github.com/alexbrainman/odbc/api"
	"github.com/lukaselmer/node-odbc/go/internal/odbcapi"
)

// Column is the metadata shape handed to JavaScript as `result.columns`.
type Column struct {
	Name          string `json:"name"`
	DataType      int16  `json:"dataType"`
	DataTypeName  string `json:"dataTypeName"`
	ColumnSize    uint64 `json:"columnSize"`
	DecimalDigits int16  `json:"decimalDigits"`
	Nullable      bool   `json:"nullable"`
}

// columnBinding holds the driver-visible buffer for one column. Long columns
// have no buffer: they are read per row with SQLGetData.
type columnBinding struct {
	bindType   int16
	isLongData bool
	bufferSize int
	buffer     unsafe.Pointer
	indicators unsafe.Pointer
}

const (
	maxUtf8Bytes    = 4
	sqlWcharSize    = 2
	sqlLenSize      = int(unsafe.Sizeof(api.SQLLEN(0)))
	sqlUlenSize     = int(unsafe.Sizeof(api.SQLULEN(0)))
	sqlSmallintSize = 2
	sqlIntegerSize  = 4
	sqlBigintSize   = 8
	sqlDoubleSize   = 8
)

// bindColumns describes every result column and binds a buffer for the ones
// that are not read through SQLGetData.
func (s *statement) bindColumns() error {
	columnCount, err := s.readColumnCount()
	if err != nil || columnCount == 0 {
		return err
	}

	if err := s.setRowBindType(); err != nil {
		return err
	}
	if err := s.bindRowsFetchedPointer(); err != nil {
		return err
	}

	s.columns = make([]Column, columnCount)
	s.bindings = make([]columnBinding, columnCount)
	for index := range columnCount {
		if err := s.describeAndBindColumn(index); err != nil {
			return err
		}
	}
	return nil
}

func (s *statement) readColumnCount() (int, error) {
	var count api.SQLSMALLINT
	ret := api.SQLNumResultCols(s.handle, &count)
	if !odbcapi.Succeeded(int16(ret)) {
		return 0, s.newError("[odbc] Error retrieving the number of columns in the result set")
	}
	return int(count), nil
}

// Drivers that cannot bind by column are tolerated when only one row is
// fetched at a time, which is what HY092 means here.
func (s *statement) setRowBindType() error {
	ret := odbcapi.SQLSetStmtAttrUintPtr(
		s.handle,
		odbcapi.SQLAttrRowBindType,
		odbcapi.SQLBindByColumn,
		0,
	)
	if odbcapi.Succeeded(int16(ret)) {
		return nil
	}
	if s.toleratesUnsupportedAttribute() {
		s.simpleBinding = true
		return nil
	}
	return s.newError("[odbc] Error setting the row bind type on the statement")
}

func (s *statement) bindRowsFetchedPointer() error {
	ret := odbcapi.SQLSetStmtAttrPointer(
		s.handle,
		odbcapi.SQLAttrRowsFetchedPtr,
		s.rowsFetched,
		0,
	)
	if odbcapi.Succeeded(int16(ret)) {
		return nil
	}
	if s.toleratesUnsupportedAttribute() {
		s.simpleBinding = true
		return nil
	}
	return s.newError("[odbc] Error setting the rows fetched pointer on the statement")
}

func (s *statement) toleratesUnsupportedAttribute() bool {
	return s.fetchSize == 1 && hasState(odbcapi.SQLHandleStmt, api.SQLHANDLE(s.handle), "HY092")
}

func (s *statement) describeAndBindColumn(index int) error {
	description, ret := odbcapi.SQLDescribeCol(s.handle, uint16(index+1), s.connection.info.maxColumnNameLength)
	if !odbcapi.Succeeded(int16(ret)) {
		return s.newError("[odbc] Error describing a column in the result set")
	}

	columnSize := correctedColumnSize(description.DataType, description.ColumnSize)
	s.columns[index] = Column{
		Name:          description.Name,
		DataType:      description.DataType,
		DataTypeName:  dataTypeName(description.DataType),
		ColumnSize:    columnSize,
		DecimalDigits: description.DecimalDigits,
		Nullable:      description.Nullable != 0,
	}

	s.bindings[index] = s.newColumnBinding(description.DataType, columnSize)
	if s.bindings[index].isLongData {
		return nil
	}
	return s.bindColumnBuffer(index)
}

// Some 4D drivers report sizes that cannot hold the formatted value.
func correctedColumnSize(dataType int16, columnSize uint64) uint64 {
	switch dataType {
	case odbcapi.SQLTypeDate:
		return max(columnSize, 10)
	case odbcapi.SQLTypeTime:
		return max(columnSize, 8)
	}
	return columnSize
}

// newColumnBinding picks the C type and buffer size for a column. A column
// size of zero means the driver is describing an unbounded type such as SQL
// Server's `(max)`, which has to go through SQLGetData.
func (s *statement) newColumnBinding(dataType int16, columnSize uint64) columnBinding {
	switch dataType {
	case odbcapi.SQLWlongvarchar:
		return s.longOrSizedBinding(odbcapi.SQLCWchar, int(columnSize+1)*sqlWcharSize)
	case odbcapi.SQLLongvarchar:
		return s.longOrSizedBinding(odbcapi.SQLCChar, int(columnSize)*maxUtf8Bytes+1)
	case odbcapi.SQLLongvarbinary:
		return s.longOrSizedBinding(odbcapi.SQLCBinary, int(columnSize))
	case odbcapi.SQLReal, odbcapi.SQLDecimal, odbcapi.SQLNumeric:
		return s.allocateBinding(odbcapi.SQLCChar, int(columnSize+2))
	case odbcapi.SQLFloat, odbcapi.SQLDouble:
		return s.allocateBinding(odbcapi.SQLCDouble, sqlDoubleSize)
	case odbcapi.SQLTinyint, odbcapi.SQLSmallint:
		return s.allocateBinding(odbcapi.SQLCShort, sqlSmallintSize)
	case odbcapi.SQLInteger:
		return s.allocateBinding(odbcapi.SQLCSlong, sqlIntegerSize)
	case odbcapi.SQLBigint:
		return s.allocateBinding(odbcapi.SQLCSbigint, sqlBigintSize)
	case odbcapi.SQLBinary, odbcapi.SQLVarbinary:
		return s.unboundedOrSizedBinding(odbcapi.SQLCBinary, columnSize, int(columnSize))
	case odbcapi.SQLWchar, odbcapi.SQLWvarchar:
		return s.unboundedOrSizedBinding(odbcapi.SQLCWchar, columnSize, int(columnSize+1)*sqlWcharSize)
	default:
		return s.unboundedOrSizedBinding(odbcapi.SQLCChar, columnSize, int(columnSize)*maxUtf8Bytes+1)
	}
}

// Long types avoid a per-row buffer that would be sized for the largest
// possible value, unless the driver cannot do SQLGetData under a block cursor.
func (s *statement) longOrSizedBinding(bindType int16, bufferSize int) columnBinding {
	if s.fetchSize == 1 || s.connection.info.getData.block {
		return columnBinding{bindType: bindType, isLongData: true}
	}
	return s.allocateBinding(bindType, bufferSize)
}

func (s *statement) unboundedOrSizedBinding(bindType int16, columnSize uint64, bufferSize int) columnBinding {
	if columnSize == 0 {
		return columnBinding{bindType: bindType, isLongData: true}
	}
	return s.allocateBinding(bindType, bufferSize)
}

func (s *statement) allocateBinding(bindType int16, bufferSize int) columnBinding {
	rows := int(s.fetchSize)
	return columnBinding{
		bindType:   bindType,
		bufferSize: bufferSize,
		buffer:     odbcapi.Alloc(bufferSize * rows),
		indicators: odbcapi.Alloc(sqlLenSize * rows),
	}
}

func (s *statement) bindColumnBuffer(index int) error {
	binding := s.bindings[index]
	ret := api.SQLBindCol(
		s.handle,
		api.SQLUSMALLINT(index+1),
		api.SQLSMALLINT(binding.bindType),
		api.SQLPOINTER(binding.buffer),
		api.SQLLEN(binding.bufferSize),
		(*api.SQLLEN)(binding.indicators),
	)
	if !odbcapi.Succeeded(int16(ret)) {
		return s.newError("[odbc] Error binding a buffer to a column in the result set")
	}
	return nil
}

func (b *columnBinding) free() {
	if b.buffer != nil {
		odbcapi.Free(b.buffer)
		b.buffer = nil
	}
	if b.indicators != nil {
		odbcapi.Free(b.indicators)
		b.indicators = nil
	}
}

func (b *columnBinding) indicatorAt(row int) api.SQLLEN {
	return *(*api.SQLLEN)(unsafe.Add(b.indicators, row*sqlLenSize))
}

func (b *columnBinding) bufferAt(row int) unsafe.Pointer {
	return unsafe.Add(b.buffer, row*b.bufferSize)
}
