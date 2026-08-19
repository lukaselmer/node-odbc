package server

import (
	"encoding/json"

	"github.com/lukaselmer/node-odbc/go/internal/odbc"
	"github.com/lukaselmer/node-odbc/go/internal/protocol"
)

// dispatch routes a request. Connecting and cancelling run off the session
// queue: connecting has no session yet, and cancelling has to reach a driver
// that may be blocking the session goroutine.
func (s *Server) dispatch(client *client, request protocol.Request) {
	switch {
	case request.Target == protocol.TargetODBC:
		go s.respond(client, request, func() (any, error) { return s.connect(client, request) })
	case isCancel(request):
		go s.respond(client, request, func() (any, error) { return s.cancel(request) })
	default:
		go s.respondOnSession(client, request)
	}
}

func isCancel(request protocol.Request) bool {
	return request.Method == "cancel" &&
		(request.Target == protocol.TargetConnection || request.Target == protocol.TargetStatement)
}

func (s *Server) respondOnSession(client *client, request protocol.Request) {
	session := s.sessionOf(request.Handle)
	if session == nil {
		s.respond(client, request, func() (any, error) { return nil, errUnknownHandle(request.Handle) })
		return
	}

	var (
		result any
		err    error
	)
	if !session.submit(func() { result, err = s.invoke(session, request) }) {
		err = errUnknownHandle(request.Handle)
	}
	client.encoder.Encode(newResponse(request.ID, result, err))
}

func (s *Server) respond(client *client, request protocol.Request, run func() (any, error)) {
	result, err := run()
	client.encoder.Encode(newResponse(request.ID, result, err))
}

func newResponse(id uint64, result any, err error) protocol.Response {
	if err != nil {
		return protocol.Response{ID: id, Error: toProtocolError(err)}
	}
	return protocol.Response{ID: id, Result: result}
}

func toProtocolError(err error) *protocol.Error {
	odbcError, isOdbc := err.(*odbc.Error)
	if !isOdbc {
		return protocol.NewError(err.Error(), nil)
	}

	records := make([]protocol.OdbcError, len(odbcError.Records))
	for index, record := range odbcError.Records {
		records[index] = protocol.OdbcError{
			State:   record.State,
			Code:    record.Code,
			Message: record.Message,
		}
	}
	return protocol.NewError(odbcError.Message, records)
}

func errUnknownHandle(handle string) error {
	return protocol.NewError("[odbc] The handle "+handle+" is no longer valid", nil)
}

func decodeArgs(raw json.RawMessage, target any) error {
	if len(raw) == 0 {
		return nil
	}
	return json.Unmarshal(raw, target)
}
