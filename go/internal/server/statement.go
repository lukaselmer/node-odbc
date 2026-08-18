package server

import (
	"github.com/lukaselmer/node-odbc/go/internal/odbc"
	"github.com/lukaselmer/node-odbc/go/internal/protocol"
)

type prepareArgs struct {
	Sql string `json:"sql"`
}

type bindArgs struct {
	Parameters []any `json:"parameters"`
}

type executeArgs struct {
	Options *optionsArgs `json:"options"`
}

func (s *Server) invokeStatement(session *session, request protocol.Request) (any, error) {
	statement, known := session.statements[request.Handle]
	if !known {
		return nil, errUnknownHandle(request.Handle)
	}

	switch request.Method {
	case "prepare":
		var args prepareArgs
		if err := decodeArgs(request.Args, &args); err != nil {
			return nil, err
		}
		return nil, statement.Prepare(args.Sql)
	case "bind":
		var args bindArgs
		if err := decodeArgs(request.Args, &args); err != nil {
			return nil, err
		}
		return nil, statement.Bind(decodeParameters(args.Parameters))
	case "execute":
		return s.execute(session, statement, request)
	case "close":
		return nil, s.closeStatement(session, request, statement)
	default:
		return nil, errUnknownMethod(request.Method)
	}
}

func (s *Server) execute(session *session, statement *odbc.Statement, request protocol.Request) (any, error) {
	var args executeArgs
	if err := decodeArgs(request.Args, &args); err != nil {
		return nil, err
	}

	result, cursor, err := statement.Execute(queryOptions(args.Options))
	if err != nil {
		return nil, err
	}
	return s.queryOutcome(session, result, cursor), nil
}

func (s *Server) closeStatement(session *session, request protocol.Request, statement *odbc.Statement) error {
	if err := statement.Close(); err != nil {
		return err
	}
	delete(session.statements, request.Handle)
	s.release(request.Handle)
	return nil
}

func (s *Server) invokeCursor(session *session, request protocol.Request) (any, error) {
	cursor, known := session.cursors[request.Handle]
	if !known {
		return nil, errUnknownHandle(request.Handle)
	}

	switch request.Method {
	case "fetch":
		result, err := cursor.Fetch()
		if err != nil {
			return nil, err
		}
		return fetchResult{Result: result, NoData: cursor.NoData()}, nil
	case "close":
		if err := cursor.Close(); err != nil {
			return nil, err
		}
		delete(session.cursors, request.Handle)
		s.release(request.Handle)
		return nil, nil
	default:
		return nil, errUnknownMethod(request.Method)
	}
}
