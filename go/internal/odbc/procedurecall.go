package odbc

import (
	"strings"
	"unsafe"

	"github.com/alexbrainman/odbc/api"
	"github.com/lukaselmer/node-odbc/go/internal/odbcapi"
	"github.com/lukaselmer/node-odbc/go/internal/protocol"
)

func (s *statement) callProcedure(qualifiedName string, values []any, directions []procedureParameter) (*Result, error) {
	s.releaseBuffers()
	s.parameters = buildProcedureParameters(values, directions)

	if err := s.bindDescribedParameters(); err != nil {
		return nil, s.newError("[odbc] Error binding parameters to the procedure")
	}

	s.sql = procedureCallSyntax(qualifiedName, len(values))
	if ret := odbcapi.SQLExecDirect(s.handle, nulTerminated(s.sql)); !odbcapi.Succeeded(int16(ret)) && ret != odbcapi.SQLNoData {
		return nil, s.newError("[odbc] Error calling the procedure")
	}

	if err := s.prepareForFetch(); err != nil {
		return nil, err
	}
	rows, err := s.fetchAll()
	if err != nil {
		return nil, err
	}

	return s.newResult(rows, s.readBackParameters(values)), nil
}

// procedureCallSyntax builds the ODBC escape sequence, which is the portable
// way to invoke a stored procedure.
func procedureCallSyntax(qualifiedName string, parameterCount int) string {
	markers := strings.TrimSuffix(strings.Repeat("?,", parameterCount), ",")
	return "{ CALL " + qualifiedName + " (" + markers + ") }"
}

func buildProcedureParameters(values []any, directions []procedureParameter) []*parameter {
	parameters := make([]*parameter, len(values))
	for index, value := range values {
		parameters[index] = newProcedureParameter(value, directions[index])
	}
	return parameters
}

func newProcedureParameter(value any, description procedureParameter) *parameter {
	built := newParameter(value)
	built.inputOutputType = description.direction
	built.parameterType = description.dataType
	built.columnSize = description.columnSize
	built.decimalDigits = description.decimalDigits

	if description.direction != odbcapi.SQLParamInput {
		widenForOutput(built, description)
	}
	return built
}

// widenForOutput replaces the buffer with one large enough for the value the
// procedure will write back, keeping the input value where there is one.
func widenForOutput(built *parameter, description procedureParameter) {
	valueType, size := outputBuffer(description)
	buffer := odbcapi.Alloc(size)

	if built.buffer != nil && built.valueType == valueType {
		copy(unsafe.Slice((*byte)(buffer), size), unsafe.Slice((*byte)(built.buffer), min(size, built.bufferLength)))
	}
	if built.buffer != nil {
		odbcapi.Free(built.buffer)
	}

	built.buffer = buffer
	built.bufferLength = size
	built.valueType = valueType
	built.isBigInt = description.dataType == odbcapi.SQLBigint
}

func outputBuffer(description procedureParameter) (int16, int) {
	switch description.dataType {
	case odbcapi.SQLDecimal, odbcapi.SQLNumeric:
		return odbcapi.SQLCChar, int(description.columnSize) + 3
	case odbcapi.SQLDouble, odbcapi.SQLFloat, odbcapi.SQLReal:
		return odbcapi.SQLCDouble, sqlDoubleSize
	case odbcapi.SQLTinyint, odbcapi.SQLSmallint:
		return odbcapi.SQLCSshort, sqlSmallintSize
	case odbcapi.SQLInteger:
		return odbcapi.SQLCSlong, sqlIntegerSize
	case odbcapi.SQLBigint:
		return odbcapi.SQLCSbigint, sqlBigintSize
	case odbcapi.SQLBinary, odbcapi.SQLVarbinary, odbcapi.SQLLongvarbinary:
		return odbcapi.SQLCBinary, int(description.columnSize)
	case odbcapi.SQLWchar, odbcapi.SQLWvarchar, odbcapi.SQLWlongvarchar:
		return odbcapi.SQLCWchar, (int(description.columnSize) + 1) * sqlWcharSize
	default:
		return odbcapi.SQLCChar, int(description.columnSize)*maxUtf8Bytes + 1
	}
}

// readBackParameters copies output values into the array the caller passed, in
// place, the way the addon did.
func (s *statement) readBackParameters(values []any) []any {
	for index, parameter := range s.parameters {
		if parameter.inputOutputType == odbcapi.SQLParamInput {
			continue
		}
		values[index] = parameter.outputValue()
	}
	return values
}

func (p *parameter) outputValue() any {
	indicator := *(*api.SQLLEN)(p.indicator)
	if indicator == odbcapi.SQLNullData {
		return nil
	}

	switch p.valueType {
	case odbcapi.SQLCDouble:
		return *(*float64)(p.buffer)
	case odbcapi.SQLCSshort:
		return float64(*(*int16)(p.buffer))
	case odbcapi.SQLCSlong:
		return float64(*(*int32)(p.buffer))
	case odbcapi.SQLCSbigint:
		return bigIntOrNumber(*(*int64)(p.buffer), p.isBigInt)
	case odbcapi.SQLCBinary:
		return protocol.Binary(copyBytes(p.buffer, int(indicator)))
	case odbcapi.SQLCWchar:
		return utf16String(p.buffer, int(indicator))
	default:
		return strings.TrimRight(string(copyBytes(p.buffer, int(indicator))), "\x00")
	}
}

func bigIntOrNumber(value int64, isBigInt bool) any {
	if isBigInt {
		return protocol.BigInt(value)
	}
	return float64(value)
}

// fetchAllAsArrays drains a result set positionally, which is how the catalog
// rows describing a procedure are read.
func (s *statement) fetchAllAsArrays() ([]any, error) {
	s.arrayRows = true
	defer func() { s.arrayRows = false }()
	return s.fetchAll()
}
