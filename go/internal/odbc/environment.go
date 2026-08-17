package odbc

import (
	"github.com/alexbrainman/odbc/api"
	"github.com/lukaselmer/node-odbc/go/internal/odbcapi"
)

// Environment owns the single SQLHENV shared by every connection.
type Environment struct {
	handle api.SQLHENV
}

func NewEnvironment() (*Environment, error) {
	var handle api.SQLHANDLE
	ret := api.SQLAllocHandle(odbcapi.SQLHandleEnv, nil, &handle)
	if !odbcapi.Succeeded(int16(ret)) {
		return nil, newErrorWithoutDiagnostics("[odbc] Error allocating the environment handle")
	}

	environment := &Environment{handle: api.SQLHENV(handle)}
	if err := environment.declareOdbcVersion(); err != nil {
		environment.Close()
		return nil, err
	}
	return environment, nil
}

func (e *Environment) Close() {
	if e.handle == nil {
		return
	}
	api.SQLFreeHandle(odbcapi.SQLHandleEnv, api.SQLHANDLE(e.handle))
	e.handle = nil
}

func (e *Environment) declareOdbcVersion() error {
	ret := api.SQLSetEnvUIntPtrAttr(e.handle, odbcapi.SQLAttrOdbcVersion, odbcapi.SQLOvOdbc3, 0)
	if !odbcapi.Succeeded(int16(ret)) {
		return newError(
			"[odbc] Error setting the ODBC version on the environment handle",
			odbcapi.SQLHandleEnv,
			api.SQLHANDLE(e.handle),
		)
	}
	return nil
}
