package odbc

import (
	"math"
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

		if !describesAType(parameter.parameterType) {
			describeFromValue(parameter)
		}
	}
	return nil
}

// describesAType reports whether the driver named a type it can bind. Ingres
// answers SQL_DEFAULT for a placeholder it cannot place, such as the one in
// `LIMIT ?`, and binding that is rejected outright.
func describesAType(parameterType int16) bool {
	return parameterType != odbcapi.SQLDefaultType && parameterType != odbcapi.SQLUnknownType
}

// describeFromValue falls back to the type the value was built as, which is the
// best guess available once the driver has declined to describe it.
func describeFromValue(p *parameter) {
	p.parameterType = sqlTypeOf(p.valueType)
	p.decimalDigits = 0
	p.nullable = 0
	p.columnSize = uint64(sizeOf(p))
}

func sqlTypeOf(valueType int16) int16 {
	switch valueType {
	case odbcapi.SQLCSshort:
		return odbcapi.SQLSmallint
	case odbcapi.SQLCSlong:
		return odbcapi.SQLInteger
	case odbcapi.SQLCSbigint:
		return odbcapi.SQLBigint
	case odbcapi.SQLCDouble:
		return odbcapi.SQLDouble
	case odbcapi.SQLCBit:
		return odbcapi.SQLBit
	case odbcapi.SQLCBinary:
		return odbcapi.SQLVarbinary
	default:
		return odbcapi.SQLVarchar
	}
}

// sizeOf is the column size the driver expects, which only matters for the
// variable length types; a fixed one takes its size from the type itself.
func sizeOf(p *parameter) int {
	switch p.valueType {
	case odbcapi.SQLCChar, odbcapi.SQLCBinary:
		return p.bufferLength
	default:
		return 0
	}
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

// numberParameter picks the narrowest C type that holds the value. JavaScript
// has one number type and a driver does not: Ingres rejects a floating point
// host variable where its grammar demands an integer, and rejects a 64-bit one
// there too, so anything that fits goes out as a plain integer.
func numberParameter(value float64) *parameter {
	whole := int64(value)
	if float64(whole) != value {
		return doubleParameter(value)
	}
	if whole >= math.MinInt32 && whole <= math.MaxInt32 {
		return integerParameter(int32(whole))
	}
	return bigIntParameter(whole, false)
}

func integerParameter(value int32) *parameter {
	buffer := odbcapi.Alloc(sqlIntegerSize)
	*(*int32)(buffer) = value
	return &parameter{
		valueType: odbcapi.SQLCSlong,
		buffer:    buffer,
		indicator: newIndicator(0),
	}
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
