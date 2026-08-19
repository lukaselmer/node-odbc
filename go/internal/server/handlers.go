package server

import (
	"github.com/lukaselmer/node-odbc/go/internal/odbc"
	"github.com/lukaselmer/node-odbc/go/internal/protocol"
)

type connectArgs struct {
	ConnectionString  string `json:"connectionString"`
	ConnectionTimeout uint32 `json:"connectionTimeout"`
	LoginTimeout      uint32 `json:"loginTimeout"`
	FetchArray        bool   `json:"fetchArray"`
}

type handleResult struct {
	Handle string `json:"handle"`
}

// queryResult carries either a materialised result or the handle of a cursor
// the caller has to drain.
type queryResult struct {
	Result *odbc.Result `json:"result,omitempty"`
	Cursor string       `json:"cursor,omitempty"`
}

type fetchResult struct {
	Result *odbc.Result `json:"result"`
	NoData bool         `json:"noData"`
}

func (s *Server) connect(client *client, request protocol.Request) (any, error) {
	var args connectArgs
	if err := decodeArgs(request.Args, &args); err != nil {
		return nil, err
	}

	connection, err := odbc.Connect(s.environment, odbc.ConnectionOptions{
		ConnectionString:  args.ConnectionString,
		ConnectionTimeout: args.ConnectionTimeout,
		LoginTimeout:      args.LoginTimeout,
		FetchArray:        args.FetchArray,
	})
	if err != nil {
		return nil, err
	}

	handle := s.newHandle("c")
	session := newSession(connection, client)
	s.registerSession(handle, session)
	client.track(handle, session)
	return handleResult{Handle: handle}, nil
}

// cancel reaches the driver directly instead of queueing, which is the only
// way to interrupt an operation that is currently occupying the session.
func (s *Server) cancel(request protocol.Request) (any, error) {
	session := s.sessionOf(request.Handle)
	if session == nil {
		return nil, errUnknownHandle(request.Handle)
	}

	if request.Target == protocol.TargetConnection {
		return nil, cancelStatements(session)
	}
	statement, known := session.statements[request.Handle]
	if !known {
		return nil, errUnknownHandle(request.Handle)
	}
	return nil, statement.Cancel()
}

func cancelStatements(session *session) error {
	var firstError error
	for _, statement := range session.statements {
		if err := statement.Cancel(); err != nil && firstError == nil {
			firstError = err
		}
	}
	return firstError
}

func (s *Server) invoke(session *session, request protocol.Request) (any, error) {
	switch request.Target {
	case protocol.TargetConnection:
		return s.invokeConnection(session, request)
	case protocol.TargetStatement:
		return s.invokeStatement(session, request)
	case protocol.TargetCursor:
		return s.invokeCursor(session, request)
	default:
		return nil, errUnknownTarget(request.Target)
	}
}

func errUnknownTarget(target string) error {
	return protocol.NewError("[odbc] Unknown request target "+target, nil)
}
