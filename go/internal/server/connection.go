package server

import (
	"github.com/lukaselmer/node-odbc/go/internal/odbc"
	"github.com/lukaselmer/node-odbc/go/internal/protocol"
)

type queryArgs struct {
	Sql        string       `json:"sql"`
	Parameters []any        `json:"parameters"`
	Options    *optionsArgs `json:"options"`
}

type optionsArgs struct {
	Cursor            any    `json:"cursor"`
	FetchSize         uint64 `json:"fetchSize"`
	Timeout           uint64 `json:"timeout"`
	InitialBufferSize int    `json:"initialBufferSize"`
}

type catalogArgs struct {
	Catalog        *string `json:"catalog"`
	Schema         *string `json:"schema"`
	Table          *string `json:"table"`
	Type           *string `json:"type"`
	Column         *string `json:"column"`
	ForeignCatalog *string `json:"foreignCatalog"`
	ForeignSchema  *string `json:"foreignSchema"`
	ForeignTable   *string `json:"foreignTable"`
}

type isolationArgs struct {
	Level uint32 `json:"level"`
}

type procedureArgs struct {
	Catalog    *string `json:"catalog"`
	Schema     *string `json:"schema"`
	Name       string  `json:"name"`
	Parameters []any   `json:"parameters"`
}

func (s *Server) invokeConnection(session *session, request protocol.Request) (any, error) {
	switch request.Method {
	case "query":
		return s.query(session, request)
	case "createStatement":
		return s.createStatement(session, request)
	case "close":
		return nil, s.closeConnection(session, request)
	case "beginTransaction":
		return nil, session.connection.BeginTransaction()
	case "commit":
		return nil, session.connection.Commit()
	case "rollback":
		return nil, session.connection.Rollback()
	case "getUsername":
		return session.connection.Username()
	case "setIsolationLevel":
		return nil, setIsolationLevel(session, request)
	case "callProcedure":
		return callProcedure(session, request)
	case "tables", "columns", "primaryKeys", "foreignKeys":
		return catalog(session, request)
	default:
		return nil, errUnknownMethod(request.Method)
	}
}

func (s *Server) query(session *session, request protocol.Request) (any, error) {
	var args queryArgs
	if err := decodeArgs(request.Args, &args); err != nil {
		return nil, err
	}

	result, cursor, err := session.connection.Query(args.Sql, decodeParameters(args.Parameters), queryOptions(args.Options))
	if err != nil {
		return nil, err
	}
	return s.queryOutcome(session, result, cursor), nil
}

func (s *Server) queryOutcome(session *session, result *odbc.Result, cursor *odbc.Cursor) queryResult {
	if cursor == nil {
		return queryResult{Result: result}
	}

	handle := s.newHandle("u")
	session.cursors[handle] = cursor
	s.registerOwner(handle, session)
	return queryResult{Cursor: handle}
}

func (s *Server) createStatement(session *session, request protocol.Request) (any, error) {
	statement, err := session.connection.CreateStatement()
	if err != nil {
		return nil, err
	}

	handle := s.newHandle("s")
	session.statements[handle] = statement
	s.registerOwner(handle, session)
	return handleResult{Handle: handle}, nil
}

func (s *Server) closeConnection(session *session, request protocol.Request) error {
	if err := session.connection.Close(); err != nil {
		return err
	}

	session.owner.forget(request.Handle)
	s.release(request.Handle)
	for handle := range session.statements {
		s.release(handle)
	}
	for handle := range session.cursors {
		s.release(handle)
	}
	go session.stop()
	return nil
}

func setIsolationLevel(session *session, request protocol.Request) error {
	var args isolationArgs
	if err := decodeArgs(request.Args, &args); err != nil {
		return err
	}
	return session.connection.SetIsolationLevel(args.Level)
}

func callProcedure(session *session, request protocol.Request) (any, error) {
	var args procedureArgs
	if err := decodeArgs(request.Args, &args); err != nil {
		return nil, err
	}

	result, err := session.connection.CallProcedure(args.Catalog, args.Schema, args.Name, decodeParameters(args.Parameters))
	if err != nil {
		return nil, err
	}
	return queryResult{Result: result}, nil
}

func catalog(session *session, request protocol.Request) (any, error) {
	var args catalogArgs
	if err := decodeArgs(request.Args, &args); err != nil {
		return nil, err
	}

	result, err := runCatalogMethod(session, request.Method, args)
	if err != nil {
		return nil, err
	}
	return queryResult{Result: result}, nil
}

func runCatalogMethod(session *session, method string, args catalogArgs) (*odbc.Result, error) {
	switch method {
	case "tables":
		return session.connection.Tables(args.Catalog, args.Schema, args.Table, args.Type)
	case "columns":
		return session.connection.Columns(args.Catalog, args.Schema, args.Table, args.Column)
	case "primaryKeys":
		return session.connection.PrimaryKeys(args.Catalog, args.Schema, args.Table)
	default:
		return session.connection.ForeignKeys(
			args.Catalog, args.Schema, args.Table,
			args.ForeignCatalog, args.ForeignSchema, args.ForeignTable,
		)
	}
}

// A fetch size implies cursor mode: the caller wants the rows in batches.
func queryOptions(args *optionsArgs) odbc.QueryOptions {
	if args == nil {
		return odbc.QueryOptions{}
	}

	options := odbc.QueryOptions{
		FetchSize:         args.FetchSize,
		Timeout:           args.Timeout,
		InitialBufferSize: args.InitialBufferSize,
		UseCursor:         args.FetchSize > 0,
	}
	switch cursor := args.Cursor.(type) {
	case bool:
		options.UseCursor = options.UseCursor || cursor
	case string:
		options.UseCursor = true
		options.CursorName = cursor
	}
	return options
}

func decodeParameters(values []any) []any {
	if values == nil {
		return nil
	}
	decoded := make([]any, len(values))
	for index, value := range values {
		decoded[index] = protocol.DecodeValue(value)
	}
	return decoded
}

func errUnknownMethod(method string) error {
	return protocol.NewError("[odbc] Unknown method "+method, nil)
}
