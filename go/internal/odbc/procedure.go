package odbc

import (
	"strings"

	"github.com/lukaselmer/node-odbc/go/internal/odbcapi"
	"github.com/lukaselmer/node-odbc/go/internal/protocol"
)

// CallProcedure discovers a procedure's signature, binds the supplied values
// according to each parameter's direction, calls it, and hands back both the
// result set and the parameter array with output values filled in.
func (c *Connection) CallProcedure(catalog, schema *string, name string, values []any) (*Result, error) {
	statement, err := newStatement(c, QueryOptions{})
	if err != nil {
		return nil, err
	}
	defer statement.free()

	qualifiedName := qualifiedProcedureName(catalog, schema, name)
	if err := statement.requireProcedureExists(catalog, schema, name, qualifiedName); err != nil {
		return nil, err
	}

	directions, err := statement.procedureParameterDirections(catalog, schema, name)
	if err != nil {
		return nil, err
	}
	if len(directions) != len(values) {
		return nil, newErrorWithoutDiagnostics(
			"[odbc] The number of parameters the procedure expects and the number of passed parameters is not equal",
		)
	}

	return statement.callProcedure(qualifiedName, values, directions)
}

func qualifiedProcedureName(catalog, schema *string, name string) string {
	parts := []string{}
	if catalog != nil && *catalog != "" {
		parts = append(parts, *catalog)
	}
	if schema != nil && *schema != "" {
		parts = append(parts, *schema)
	}
	return strings.Join(append(parts, name), ".")
}

func (s *statement) requireProcedureExists(catalog, schema *string, name, qualifiedName string) error {
	rows, err := s.catalogRows(
		"[odbc] Error retrieving information about the procedures in the database",
		func() int16 {
			return int16(odbcapi.SQLProcedures(s.handle, optional(catalog), optional(schema), nulTerminated(name)))
		},
	)
	if err != nil {
		return err
	}
	if len(rows) == 0 {
		return newErrorWithoutDiagnostics(
			"[odbc] Stored procedure '" + qualifiedName + "' doesn't exist",
		)
	}
	return nil
}

// procedureParameterDirections reads SQLProcedureColumns and keeps the pieces
// binding needs: the direction and the SQL type of each parameter.
func (s *statement) procedureParameterDirections(catalog, schema *string, name string) ([]procedureParameter, error) {
	rows, err := s.catalogRows(
		"[odbc] Error retrieving information about the columns in the procedure",
		func() int16 {
			return int16(odbcapi.SQLProcedureColumns(s.handle, optional(catalog), optional(schema), nulTerminated(name), nil))
		},
	)
	if err != nil {
		return nil, err
	}

	parameters := []procedureParameter{}
	for _, row := range rows {
		parameter, isParameter := procedureParameterOf(row)
		if isParameter {
			parameters = append(parameters, parameter)
		}
	}
	return parameters, nil
}

type procedureParameter struct {
	direction     int16
	dataType      int16
	columnSize    uint64
	decimalDigits int16
}

const (
	procedureColumnTypeIndex     = 4
	procedureDataTypeIndex       = 5
	procedureColumnSizeIndex     = 7
	procedureDecimalDigitsIndex  = 9
	procedureColumnResultIndex   = 5
	procedureReturnValueColumn   = 5
	procedureColumnKindResult    = 3
	procedureColumnKindReturnVal = 5
)

func procedureParameterOf(row any) (procedureParameter, bool) {
	values, isArray := row.([]any)
	if !isArray {
		return procedureParameter{}, false
	}

	direction := int16(numberAt(values, procedureColumnTypeIndex))
	if direction == procedureColumnKindResult || direction == procedureColumnKindReturnVal {
		return procedureParameter{}, false
	}

	return procedureParameter{
		direction:     direction,
		dataType:      int16(numberAt(values, procedureDataTypeIndex)),
		columnSize:    uint64(numberAt(values, procedureColumnSizeIndex)),
		decimalDigits: int16(numberAt(values, procedureDecimalDigitsIndex)),
	}, true
}

func numberAt(values []any, index int) float64 {
	if index >= len(values) {
		return 0
	}
	switch value := values[index].(type) {
	case float64:
		return value
	case protocol.BigInt:
		return float64(value)
	default:
		return 0
	}
}

// catalogRows runs one catalog call on the statement and drains it, resetting
// the statement so that the next call can reuse the handle.
func (s *statement) catalogRows(message string, call func() int16) ([]any, error) {
	s.releaseBuffers()
	if ret := call(); !odbcapi.Succeeded(ret) && ret != odbcapi.SQLNoData {
		return nil, s.newError(message)
	}
	if err := s.prepareForFetch(); err != nil {
		return nil, err
	}
	return s.fetchAllAsArrays()
}
