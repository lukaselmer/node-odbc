package odbc

import (
	"strconv"
	"strings"
	"unicode/utf16"
	"unsafe"

	"github.com/alexbrainman/odbc/api"
	"github.com/lukaselmer/node-odbc/go/internal/odbcapi"
	"github.com/lukaselmer/node-odbc/go/internal/protocol"
)

// convertBoundValue turns the bytes SQLFetch left in a bound buffer into the
// value JavaScript sees. The SQL type decides the shape, the C type decides
// how to read the buffer.
func convertBoundValue(column Column, binding *columnBinding, row int) any {
	indicator := binding.indicatorAt(row)
	if indicator == odbcapi.SQLNullData {
		return nil
	}

	buffer := binding.bufferAt(row)
	switch column.DataType {
	case odbcapi.SQLReal, odbcapi.SQLDecimal, odbcapi.SQLNumeric,
		odbcapi.SQLFloat, odbcapi.SQLDouble:
		return numberFromBuffer(binding.bindType, buffer)
	case odbcapi.SQLTinyint, odbcapi.SQLSmallint, odbcapi.SQLInteger:
		return integerFromBuffer(binding.bindType, buffer)
	case odbcapi.SQLBigint:
		return bigIntFromBuffer(binding.bindType, buffer, indicator)
	case odbcapi.SQLBinary, odbcapi.SQLVarbinary, odbcapi.SQLLongvarbinary:
		return protocol.Binary(copyBytes(buffer, int(indicator)))
	case odbcapi.SQLWchar, odbcapi.SQLWvarchar, odbcapi.SQLWlongvarchar:
		return utf16String(buffer, int(indicator))
	default:
		return string(copyBytes(buffer, int(indicator)))
	}
}

// convertLongValue does the same for a value assembled by SQLGetData, where
// the bytes already live in a Go slice.
func convertLongValue(column Column, bindType int16, data []byte) any {
	switch column.DataType {
	case odbcapi.SQLReal, odbcapi.SQLDecimal, odbcapi.SQLNumeric,
		odbcapi.SQLFloat, odbcapi.SQLDouble:
		return parseFloat(string(data))
	case odbcapi.SQLBinary, odbcapi.SQLVarbinary, odbcapi.SQLLongvarbinary:
		return protocol.Binary(data)
	case odbcapi.SQLWchar, odbcapi.SQLWvarchar, odbcapi.SQLWlongvarchar:
		return decodeUtf16(data)
	default:
		if bindType == odbcapi.SQLCBinary {
			return protocol.Binary(data)
		}
		return string(data)
	}
}

func numberFromBuffer(bindType int16, buffer unsafe.Pointer) any {
	if bindType == odbcapi.SQLCDouble {
		return *(*float64)(buffer)
	}
	return parseFloat(nulTerminatedString(buffer))
}

func integerFromBuffer(bindType int16, buffer unsafe.Pointer) any {
	switch bindType {
	case odbcapi.SQLCShort, odbcapi.SQLCSshort, odbcapi.SQLCUshort:
		return float64(*(*int16)(buffer))
	case odbcapi.SQLCLong, odbcapi.SQLCSlong, odbcapi.SQLCUlong:
		return float64(*(*int32)(buffer))
	default:
		return float64(*(*int32)(buffer))
	}
}

// A BIGINT only survives as a JavaScript BigInt when the driver gave us the
// binary form; otherwise the addon handed the digits through as a string.
func bigIntFromBuffer(bindType int16, buffer unsafe.Pointer, indicator api.SQLLEN) any {
	if bindType == odbcapi.SQLCSbigint {
		return protocol.BigInt(*(*int64)(buffer))
	}
	return string(copyBytes(buffer, int(indicator)))
}

// parseFloat mirrors atof: unparsable input becomes zero rather than an error.
func parseFloat(text string) float64 {
	value, err := strconv.ParseFloat(strings.TrimSpace(text), 64)
	if err != nil {
		return 0
	}
	return value
}

func utf16String(buffer unsafe.Pointer, byteLength int) string {
	return decodeUtf16(copyBytes(buffer, byteLength))
}

func decodeUtf16(data []byte) string {
	units := make([]uint16, 0, len(data)/2)
	for index := 0; index+1 < len(data); index += 2 {
		units = append(units, uint16(data[index])|uint16(data[index+1])<<8)
	}
	return string(utf16.Decode(units))
}

func copyBytes(buffer unsafe.Pointer, length int) []byte {
	if length <= 0 {
		return []byte{}
	}
	data := make([]byte, length)
	copy(data, unsafe.Slice((*byte)(buffer), length))
	return data
}

func nulTerminatedString(buffer unsafe.Pointer) string {
	bytes := unsafe.Slice((*byte)(buffer), maxNumericTextBytes)
	for index, character := range bytes {
		if character == 0 {
			return string(bytes[:index])
		}
	}
	return string(bytes)
}

const maxNumericTextBytes = 64
