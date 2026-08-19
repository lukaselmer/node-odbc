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
	initialMessageBytes  = 2048
	maxMessageBytes      = 32767
	maxDiagnosticRecords = 64
	noErrorInformation   = "<No error information available>"
)

// newError collects every diagnostic record attached to a handle, always
// yielding at least one record.
func newError(message string, handleType int16, handle api.SQLHANDLE) *Error {
	return &Error{Message: message, Records: diagnosticsOf(handleType, handle)}
}

// newErrorWithoutDiagnostics reports a failure that has no driver diagnostics,
// such as a failed allocation.
func newErrorWithoutDiagnostics(message string) *Error {
	return &Error{Message: message, Records: []DiagnosticRecord{}}
}

// diagnosticsOf reads every record the driver has for a handle.
//
// SQL_DIAG_NUMBER is deliberately not consulted: drivers get it wrong in both
// directions, so records are read until the driver reports SQL_NO_DATA,
// bounded in case it never does. A failure always yields at least one record,
// so that callers reading odbcErrors[0] always find something.
func diagnosticsOf(handleType int16, handle api.SQLHANDLE) []DiagnosticRecord {
	records := []DiagnosticRecord{}
	if handle == nil {
		return append(records, DiagnosticRecord{Message: noErrorInformation})
	}

	for number := 1; number <= maxDiagnosticRecords; number++ {
		record, ok := diagnosticRecord(handleType, handle, int16(number))
		if !ok {
			break
		}
		records = append(records, record)
	}

	if len(records) == 0 {
		// The driver reported a failure but will not say why.
		return append(records, DiagnosticRecord{Message: noErrorInformation})
	}
	return records
}

// diagnosticRecord reads one record, growing the buffer until the message fits.
//
// The length a driver reports is not reliable: the specification says it is the
// number of characters available, but some report only what they copied. A
// completely filled buffer is therefore the only dependable sign of truncation.
func diagnosticRecord(handleType int16, handle api.SQLHANDLE, number int16) (DiagnosticRecord, bool) {
	for size := initialMessageBytes; ; {
		record, ret := odbcapi.SQLGetDiagRec(handleType, handle, number, size)
		if !odbcapi.Succeeded(int16(ret)) {
			// SQL_NO_DATA is the normal way out; any other failure is treated
			// the same way, keeping whatever was already collected.
			return DiagnosticRecord{}, false
		}

		if filled(record, size) && size < maxMessageBytes {
			size = min(grownSize(record, size), maxMessageBytes)
			continue
		}

		return DiagnosticRecord{
			State:   record.State,
			Code:    record.Code,
			Message: record.Message,
		}, true
	}
}

func filled(record odbcapi.DiagnosticRecord, size int) bool {
	return record.TextLength < 0 || record.TextLength >= size-1
}

func grownSize(record odbcapi.DiagnosticRecord, size int) int {
	if required := record.TextLength + 1; required > size*2 {
		return required
	}
	return size * 2
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
