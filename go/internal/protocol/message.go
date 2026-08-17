// Package protocol defines the framed JSON messages exchanged between the Node
// client and the ODBC sidecar.
package protocol

import (
	"encoding/json"
)

// Target names the kind of object a request addresses.
const (
	TargetODBC       = "odbc"
	TargetConnection = "connection"
	TargetStatement  = "statement"
	TargetCursor     = "cursor"
)

type Request struct {
	ID     uint64          `json:"id"`
	Target string          `json:"target"`
	Handle string          `json:"handle,omitempty"`
	Method string          `json:"method"`
	Args   json.RawMessage `json:"args,omitempty"`
}

type Response struct {
	ID     uint64          `json:"id"`
	Result any             `json:"result"`
	Error  *Error          `json:"error,omitempty"`
	Events []Event         `json:"events,omitempty"`
}

// Event carries state that the JS side exposes through synchronous getters and
// therefore has to mirror locally.
type Event struct {
	Handle string `json:"handle"`
	Name   string `json:"name"`
	Value  any    `json:"value"`
}

type Error struct {
	Message    string      `json:"message"`
	OdbcErrors []OdbcError `json:"odbcErrors"`
}

type OdbcError struct {
	State   string `json:"state"`
	Code    int32  `json:"code"`
	Message string `json:"message"`
}

func (e *Error) Error() string { return e.Message }

// NewError builds the error shape the addon produced: a message plus the
// diagnostic records, which are always present as an array.
func NewError(message string, odbcErrors []OdbcError) *Error {
	if odbcErrors == nil {
		odbcErrors = []OdbcError{}
	}
	return &Error{Message: message, OdbcErrors: odbcErrors}
}
