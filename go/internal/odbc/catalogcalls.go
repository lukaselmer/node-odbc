package odbc

import (
	"github.com/alexbrainman/odbc/api"
	"github.com/lukaselmer/node-odbc/go/internal/odbcapi"
)

func sqlTables(handle api.SQLHSTMT, catalog, schema, table, tableType *string) api.SQLRETURN {
	return odbcapi.SQLTables(handle, optional(catalog), optional(schema), optional(table), optional(tableType))
}

func sqlColumns(handle api.SQLHSTMT, catalog, schema, table, column *string) api.SQLRETURN {
	return odbcapi.SQLColumns(handle, optional(catalog), optional(schema), optional(table), optional(column))
}

func sqlPrimaryKeys(handle api.SQLHSTMT, catalog, schema, table *string) api.SQLRETURN {
	return odbcapi.SQLPrimaryKeys(handle, optional(catalog), optional(schema), optional(table))
}

func sqlForeignKeys(handle api.SQLHSTMT, catalog, schema, table, foreignCatalog, foreignSchema, foreignTable *string) api.SQLRETURN {
	return odbcapi.SQLForeignKeys(
		handle,
		optional(catalog), optional(schema), optional(table),
		optional(foreignCatalog), optional(foreignSchema), optional(foreignTable),
	)
}

func succeededOrNoData(ret api.SQLRETURN) bool {
	return odbcapi.Succeeded(int16(ret)) || ret == odbcapi.SQLNoData
}
