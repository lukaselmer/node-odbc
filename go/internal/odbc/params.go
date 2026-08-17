package odbc

import (
	"unsafe"

	"github.com/alexbrainman/odbc/api"
	"github.com/lukaselmer/node-odbc/go/internal/odbcapi"
	"github.com/lukaselmer/node-odbc/go/internal/protocol"
)

// parameter mirrors one entry of the addon's Parameter array. The value buffer
// stays live inside the driver until the statement is freed, so it is C memory.
type parameter struct {
	inputOutputType int16
	valueType       int16
	parameterType   int16
	columnSize      uint64
	decimalDigits   int16
	nullable        int16
	buffer          unsafe.Pointer
	bufferLength    int
	indicator       unsafe.Pointer
	isBigInt        bool
}

func (s *statement) bindParameters(values []any) error {
	s.parameters = make([]*parameter, len(values))
	for index, value := range values {
		s.parameters[index] = newParameter(value)
	}

	if err := s.describeParameters(); err != nil {
		return err
	}
	return s.bindDescribedParameters()
}

func (s *statement) describeParameters() error {
	for index, parameter := range s.parameters {
		parameter.inputOutputType = odbcapi.SQLParamInput

		var (
			parameterType api.SQLSMALLINT
			columnSize    api.SQLULEN
			decimalDigits api.SQLSMALLINT
			nullable      api.SQLSMALLINT
		)
		ret := api.SQLDescribeParam(s.handle, api.SQLUSMALLINT(index+1), &parameterType, &columnSize, &decimalDigits, &nullable)
		if !odbcapi.Succeeded(int16(ret)) {
			return s.newError("[odbc] Error getting information about parameters")
		}

		parameter.parameterType = int16(parameterType)
		parameter.columnSize = uint64(columnSize)
		parameter.decimalDigits = int16(decimalDigits)
		parameter.nullable = int16(nullable)
	}
	return nil
}

func (s *statement) bindDescribedParameters() error {
	for index, parameter := range s.parameters {
		ret := api.SQLBindParameter(
			s.handle,
			api.SQLUSMALLINT(index+1),
			api.SQLSMALLINT(parameter.inputOutputType),
			api.SQLSMALLINT(parameter.valueType),
			api.SQLSMALLINT(parameter.parameterType),
			api.SQLULEN(parameter.columnSize),
			api.SQLSMALLINT(parameter.decimalDigits),
			api.SQLPOINTER(parameter.buffer),
			api.SQLLEN(parameter.bufferLength),
			(*api.SQLLEN)(parameter.indicator),
		)
		if !odbcapi.Succeeded(int16(ret)) {
			return s.newError("[odbc] Error binding parameters")
		}
	}
	return nil
}

// newParameter chooses the C type for a value the way the addon did. Whole
// numbers go out as 64-bit integers so that large identifiers survive.
func newParameter(value any) *parameter {
	switch typed := value.(type) {
	case nil:
		return nullParameter()
	case protocol.BigInt:
		return bigIntParameter(int64(typed), true)
	case protocol.Binary:
		return binaryParameter(typed)
	case bool:
		return boolParameter(typed)
	case string:
		return stringParameter(typed)
	case float64:
		return numberParameter(typed)
	default:
		return nullParameter()
	}
}

func nullParameter() *parameter {
	return &parameter{valueType: odbcapi.SQLCDefault, indicator: newIndicator(odbcapi.SQLNullData)}
}

func numberParameter(value float64) *parameter {
	if whole := int64(value); float64(whole) == value {
		return bigIntParameter(whole, false)
	}
	return doubleParameter(value)
}

func bigIntParameter(value int64, isBigInt bool) *parameter {
	buffer := odbcapi.Alloc(sqlBigintSize)
	*(*int64)(buffer) = value
	return &parameter{
		valueType: odbcapi.SQLCSbigint,
		buffer:    buffer,
		indicator: newIndicator(0),
		isBigInt:  isBigInt,
	}
}

func doubleParameter(value float64) *parameter {
	buffer := odbcapi.Alloc(sqlDoubleSize)
	*(*float64)(buffer) = value
	return &parameter{valueType: odbcapi.SQLCDouble, buffer: buffer, indicator: newIndicator(0)}
}

func boolParameter(value bool) *parameter {
	buffer := odbcapi.Alloc(1)
	if value {
		*(*byte)(buffer) = 1
	}
	return &parameter{valueType: odbcapi.SQLCBit, buffer: buffer, indicator: newIndicator(0)}
}

func binaryParameter(value []byte) *parameter {
	buffer := odbcapi.Alloc(max(len(value), 1))
	copy(unsafe.Slice((*byte)(buffer), max(len(value), 1)), value)
	return &parameter{
		valueType:    odbcapi.SQLCBinary,
		buffer:       buffer,
		bufferLength: len(value),
		indicator:    newIndicator(api.SQLLEN(len(value))),
	}
}

func stringParameter(value string) *parameter {
	bytes := nulTerminated(value)
	buffer := odbcapi.Alloc(len(bytes))
	copy(unsafe.Slice((*byte)(buffer), len(bytes)), bytes)
	return &parameter{
		valueType:    odbcapi.SQLCChar,
		buffer:       buffer,
		bufferLength: len(bytes),
		indicator:    newIndicator(odbcapi.SQLNTS),
	}
}

func newIndicator(value api.SQLLEN) unsafe.Pointer {
	indicator := odbcapi.Alloc(sqlLenSize)
	*(*api.SQLLEN)(indicator) = value
	return indicator
}

func (p *parameter) free() {
	if p.buffer != nil {
		odbcapi.Free(p.buffer)
		p.buffer = nil
	}
	if p.indicator != nil {
		odbcapi.Free(p.indicator)
		p.indicator = nil
	}
}
