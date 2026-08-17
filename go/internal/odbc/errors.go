package odbc

import (
	"github.com/alexbrainman/odbc/api"
	"github.com/lukaselmer/node-odbc/go/internal/odbcapi"
)

// Error carries the message the addon used plus the driver's diagnostic
// records, which reach JavaScript as `error.odbcErrors`.
type Error struct {
	Message string
	Records []DiagnosticRecord
}

type DiagnosticRecord struct {
	State   string
	Code    int32
	Message string
}

func (e *Error) Error() string { return e.Message }

const (
	errorMessageBytes  = 2048
	noErrorInformation = "<No error information available>"
)

// newError collects every diagnostic record attached to a handle. A handle
// that reports no diagnostics yields an empty slice, matching the addon.
func newError(message string, handleType int16, handle api.SQLHANDLE) *Error {
	return &Error{Message: message, Records: diagnosticsOf(handleType, handle)}
}

// newErrorWithoutDiagnostics reports a failure that has no driver diagnostics,
// such as a failed allocation.
func newErrorWithoutDiagnostics(message string) *Error {
	return &Error{Message: message, Records: []DiagnosticRecord{}}
}

func diagnosticsOf(handleType int16, handle api.SQLHANDLE) []DiagnosticRecord {
	records := []DiagnosticRecord{}
	if handle == nil {
		return records
	}

	count, ret := odbcapi.SQLGetDiagFieldRecordCount(handleType, handle)
	if !odbcapi.Succeeded(int16(ret)) {
		return records
	}

	for number := int32(1); number <= count; number++ {
		record, ret := odbcapi.SQLGetDiagRec(handleType, handle, int16(number), errorMessageBytes)
		if !odbcapi.Succeeded(int16(ret)) {
			records = append(records, DiagnosticRecord{Message: noErrorInformation})
			continue
		}
		records = append(records, DiagnosticRecord{
			State:   record.State,
			Code:    record.Code,
			Message: record.Message,
		})
	}
	return records
}

// hasState reports whether any diagnostic on the handle carries the given
// SQLSTATE, which is how the driver workarounds decide to tolerate a failure.
func hasState(handleType int16, handle api.SQLHANDLE, state string) bool {
	for _, record := range diagnosticsOf(handleType, handle) {
		if record.State == state {
			return true
		}
	}
	return false
}
