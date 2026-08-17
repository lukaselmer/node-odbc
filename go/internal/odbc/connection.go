package odbc

import (
	"github.com/alexbrainman/odbc/api"
	"github.com/lukaselmer/node-odbc/go/internal/odbcapi"
)

type ConnectionOptions struct {
	ConnectionString  string
	ConnectionTimeout uint32
	LoginTimeout      uint32
	FetchArray        bool
}

// Connection wraps one SQLHDBC. It is not safe for concurrent use; the server
// gives every connection its own goroutine.
type Connection struct {
	handle     api.SQLHDBC
	options    ConnectionOptions
	info       connectionInfo
	connected  bool
	autocommit bool
}

// connectionInfo caches the SQLGetInfo answers the fetch path needs.
type connectionInfo struct {
	maxColumnNameLength int
	isolationOptions    uint32
	getData             getDataExtensions
}

type getDataExtensions struct {
	anyColumn bool
	anyOrder  bool
	block     bool
	bound     bool
}

const defaultMaxColumnNameLength = 128

func Connect(environment *Environment, options ConnectionOptions) (*Connection, error) {
	handle, err := allocateConnectionHandle(environment)
	if err != nil {
		return nil, err
	}

	connection := &Connection{handle: handle, options: options, autocommit: true}
	if err := connection.applyTimeouts(); err != nil {
		connection.freeHandle()
		return nil, err
	}
	if err := connection.driverConnect(); err != nil {
		connection.freeHandle()
		return nil, err
	}

	connection.connected = true
	connection.info = connection.readInfo()
	return connection, nil
}

func (c *Connection) Connected() bool  { return c.connected }
func (c *Connection) Autocommit() bool { return c.autocommit }
func (c *Connection) FetchArray() bool { return c.options.FetchArray }

func allocateConnectionHandle(environment *Environment) (api.SQLHDBC, error) {
	var handle api.SQLHANDLE
	ret := api.SQLAllocHandle(odbcapi.SQLHandleDbc, api.SQLHANDLE(environment.handle), &handle)
	if !odbcapi.Succeeded(int16(ret)) {
		return nil, newError(
			"[odbc] Error allocating the connection handle",
			odbcapi.SQLHandleEnv,
			api.SQLHANDLE(environment.handle),
		)
	}
	return api.SQLHDBC(handle), nil
}

func (c *Connection) applyTimeouts() error {
	if c.options.ConnectionTimeout > 0 {
		ret := api.SQLSetConnectUIntPtrAttr(
			c.handle,
			odbcapi.SQLAttrConnectionTimeout,
			uintptr(c.options.ConnectionTimeout),
			odbcapi.SQLIsUinteger,
		)
		if !odbcapi.Succeeded(int16(ret)) {
			return c.newError("[odbc] Error setting the connection timeout")
		}
	}

	if c.options.LoginTimeout > 0 {
		ret := api.SQLSetConnectUIntPtrAttr(
			c.handle,
			odbcapi.SQLAttrLoginTimeout,
			uintptr(c.options.LoginTimeout),
			odbcapi.SQLIsUinteger,
		)
		if !odbcapi.Succeeded(int16(ret)) {
			return c.newError("[odbc] Error setting the login timeout")
		}
		if ret == odbcapi.SQLSuccessWithInfo {
			return c.readSubstitutedLoginTimeout()
		}
	}
	return nil
}

// A driver may substitute a login timeout it cannot honour and say so with a
// warning; the addon read the value back.
func (c *Connection) readSubstitutedLoginTimeout() error {
	value, ret := odbcapi.SQLGetConnectAttrUint32(c.handle, odbcapi.SQLAttrLoginTimeout)
	if !odbcapi.Succeeded(int16(ret)) {
		return c.newError("[odbc] Error setting retrieving the changed login timeout")
	}
	c.options.LoginTimeout = value
	return nil
}

func (c *Connection) driverConnect() error {
	ret := odbcapi.SQLDriverConnect(c.handle, nulTerminated(c.options.ConnectionString))
	if !odbcapi.Succeeded(int16(ret)) {
		return c.newError("[odbc] Error connecting to the database")
	}
	return nil
}

// readInfo probes the driver. Every question is optional: a driver that cannot
// answer gets the addon's defaults rather than a failed connection.
func (c *Connection) readInfo() connectionInfo {
	info := connectionInfo{maxColumnNameLength: defaultMaxColumnNameLength}

	if length, ret := odbcapi.SQLGetInfoUint16(c.handle, odbcapi.SQLMaxColumnNameLen); odbcapi.Succeeded(int16(ret)) && length > 0 {
		info.maxColumnNameLength = int(length)
	}
	if options, ret := odbcapi.SQLGetInfoUint32(c.handle, odbcapi.SQLTxnIsolationOption); odbcapi.Succeeded(int16(ret)) {
		info.isolationOptions = options
	}
	if extensions, ret := odbcapi.SQLGetInfoUint32(c.handle, odbcapi.SQLGetdataExtensions); odbcapi.Succeeded(int16(ret)) {
		info.getData = getDataExtensions{
			anyColumn: extensions&odbcapi.SQLGdAnyColumn != 0,
			anyOrder:  extensions&odbcapi.SQLGdAnyOrder != 0,
			block:     extensions&odbcapi.SQLGdBlock != 0,
			bound:     extensions&odbcapi.SQLGdBound != 0,
		}
	}
	return info
}

func (c *Connection) Username() (string, error) {
	name, ret := odbcapi.SQLGetInfoString(c.handle, odbcapi.SQLUserName, 256)
	if !odbcapi.Succeeded(int16(ret)) {
		return "", c.newError("[odbc] Error getting the username")
	}
	return name, nil
}

func (c *Connection) Close() error {
	if c.handle == nil {
		c.connected = false
		return nil
	}

	if ret := api.SQLEndTran(odbcapi.SQLHandleDbc, api.SQLHANDLE(c.handle), odbcapi.SQLRollback); !odbcapi.Succeeded(int16(ret)) {
		return c.newError("[odbc] Error ending potential transactions when closing the connection")
	}
	if ret := api.SQLDisconnect(c.handle); !odbcapi.Succeeded(int16(ret)) {
		return c.newError("[odbc] Error disconnecting when closing the connection")
	}
	if ret := api.SQLFreeHandle(odbcapi.SQLHandleDbc, api.SQLHANDLE(c.handle)); !odbcapi.Succeeded(int16(ret)) {
		return c.newError("[odbc] Error freeing connection handle when closing the connection")
	}

	c.handle = nil
	c.connected = false
	return nil
}

func (c *Connection) BeginTransaction() error {
	ret := api.SQLSetConnectUIntPtrAttr(
		c.handle,
		odbcapi.SQLAttrAutocommit,
		odbcapi.SQLAutocommitOff,
		odbcapi.SQLIsUinteger,
	)
	if !odbcapi.Succeeded(int16(ret)) {
		return c.newError("[odbc] Error turning off autocommit on the connection")
	}
	c.autocommit = false
	return nil
}

func (c *Connection) Commit() error   { return c.endTransaction(odbcapi.SQLCommit) }
func (c *Connection) Rollback() error { return c.endTransaction(odbcapi.SQLRollback) }

// Ending a transaction always restores autocommit, so a commit or rollback
// outside a transaction is harmless.
func (c *Connection) endTransaction(completion int16) error {
	ret := api.SQLEndTran(odbcapi.SQLHandleDbc, api.SQLHANDLE(c.handle), api.SQLSMALLINT(completion))
	if !odbcapi.Succeeded(int16(ret)) {
		return c.newError(endTransactionErrorMessage(completion))
	}

	ret = api.SQLSetConnectUIntPtrAttr(
		c.handle,
		odbcapi.SQLAttrAutocommit,
		odbcapi.SQLAutocommitOn,
		odbcapi.SQLIsUinteger,
	)
	if !odbcapi.Succeeded(int16(ret)) {
		return c.newError("[odbc] Error turning on autocommit on the connection")
	}
	c.autocommit = true
	return nil
}

func endTransactionErrorMessage(completion int16) string {
	if completion == odbcapi.SQLCommit {
		return "[odbc] Error committing the transaction"
	}
	return "[odbc] Error rolling back the transaction"
}

func (c *Connection) SetIsolationLevel(level uint32) error {
	if c.info.isolationOptions&level == 0 {
		return newErrorWithoutDiagnostics("[odbc] Error: isolation level is not supported by the connected database")
	}

	ret := api.SQLSetConnectUIntPtrAttr(
		c.handle,
		odbcapi.SQLAttrTxnIsolation,
		uintptr(level),
		odbcapi.SQLIsUinteger,
	)
	if !odbcapi.Succeeded(int16(ret)) {
		return c.newError("[odbc] Error setting the isolation level")
	}
	return nil
}

func (c *Connection) newError(message string) *Error {
	return newError(message, odbcapi.SQLHandleDbc, api.SQLHANDLE(c.handle))
}

func (c *Connection) freeHandle() {
	if c.handle == nil {
		return
	}
	api.SQLFreeHandle(odbcapi.SQLHandleDbc, api.SQLHANDLE(c.handle))
	c.handle = nil
}

// nulTerminated returns the UTF-8 bytes of a string with the terminator the
// narrow ODBC entry points expect.
func nulTerminated(value string) []byte {
	return append([]byte(value), 0)
}
