package odbc

import "github.com/alexbrainman/odbc/api"

// The catalog functions all produce a result set the same way a query does, so
// they differ only in which SQL* call opens it.
func (c *Connection) Tables(catalog, schema, table, tableType *string) (*Result, error) {
	return c.runCatalog("[odbc] Error retrieving table information", func(s *statement) api.SQLRETURN {
		return sqlTables(s.handle, catalog, schema, table, tableType)
	})
}

func (c *Connection) Columns(catalog, schema, table, column *string) (*Result, error) {
	return c.runCatalog("[odbc] Error retrieving column information", func(s *statement) api.SQLRETURN {
		return sqlColumns(s.handle, catalog, schema, table, column)
	})
}

func (c *Connection) PrimaryKeys(catalog, schema, table *string) (*Result, error) {
	return c.runCatalog("[odbc] Error retrieving primary key information", func(s *statement) api.SQLRETURN {
		return sqlPrimaryKeys(s.handle, catalog, schema, table)
	})
}

func (c *Connection) ForeignKeys(catalog, schema, table, foreignCatalog, foreignSchema, foreignTable *string) (*Result, error) {
	return c.runCatalog("[odbc] Error retrieving foreign key information", func(s *statement) api.SQLRETURN {
		return sqlForeignKeys(s.handle, catalog, schema, table, foreignCatalog, foreignSchema, foreignTable)
	})
}

func (c *Connection) runCatalog(message string, open func(*statement) api.SQLRETURN) (*Result, error) {
	statement, err := newStatement(c, QueryOptions{})
	if err != nil {
		return nil, err
	}
	defer statement.free()

	if ret := open(statement); !succeededOrNoData(ret) {
		return nil, statement.newError(message)
	}
	if err := statement.prepareForFetch(); err != nil {
		return nil, err
	}

	rows, err := statement.fetchAll()
	if err != nil {
		return nil, err
	}
	return statement.newCatalogResult(rows), nil
}

// Catalog results report no statement text and no parameters.
func (s *statement) newCatalogResult(rows []any) *Result {
	return &Result{
		Rows:       rows,
		Count:      s.rowCount,
		Columns:    s.columnsOrEmpty(),
		Statement:  nil,
		Parameters: []any{},
	}
}

// optional keeps ODBC's distinction between "not specified" and "the empty
// string", which the catalog functions treat differently.
func optional(value *string) []byte {
	if value == nil {
		return nil
	}
	return nulTerminated(*value)
}
