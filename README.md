# @lukaselmer/odbc


An asynchronous interface for Node.js to unixODBC and its supported drivers.

---

## Requirements


* unixODBC binaries and development libraries for module compilation
  * on Ubuntu/Debian `sudo apt-get install unixodbc unixodbc-dev`
  * on RedHat/CentOS `sudo yum install unixODBC unixODBC-devel`
  * on OSX
    * using macports.org `sudo port unixODBC`
    * using brew `brew install unixODBC`
  * on FreeBSD from ports `cd /usr/ports/databases/unixODBC; make install`
  * on IBM i `yum install unixODBC unixODBC-devel` (requires [yum](http://ibm.biz/ibmi-rpms))
* ODBC drivers for target database
* properly configured odbc.ini and odbcinst.ini.

---

## Node.js Version Support

This package is a native addon written in Rust using [napi-rs](https://napi.rs/).
Its API is Promise-only, built on `async`/`await` throughout, so `node-odbc`
requires:

* Node.js 24 or later

---

## Installation

Three main steps must be done before `node-odbc` can interact with your database:

* **Install unixODBC and unixODBC-devel:** Compilation of `node-odbc` on your system requires these packages to provide the correct headers.
  * **Ubuntu/Debian**: `sudo apt-get install unixodbc unixodbc-dev`
  * **RedHat/CentOS**: `sudo yum install unixODBC unixODBC-devel`
  * **OSX**:
    * **macports.<span></span>org:** `sudo port unixODBC`
    * **using brew:** `brew install unixODBC`
  * **FreeBSD** from ports: `cd /usr/ports/databases/unixODBC; make install`
  * **IBM i:** `yum install unixODBC unixODBC-devel` (requires [yum](http://ibm.biz/ibmi-rpms))

* **Install ODBC drivers for target database:** Most database management system providers offer ODBC drivers for their product. See the website of your DBMS for more information.

* **odbc.ini and odbcinst.ini**: These files define your DSNs (data source names) and ODBC drivers, respectively. They must be set up for ODBC functions to correctly interact with your database.

When all these steps have been completed, install `node-odbc` into your Node.js project by using:

```bash
npm install @lukaselmer/odbc
```

Prebuilt binaries for common platforms ship in `prebuilds/`, so most installs need nothing further. If no prebuilt binary matches your platform, building the addon from source with `npm run build` requires a Rust toolchain.

---

## Debugging

This package used to contain its own method of tracing ODBC calls, which was enabled by recompiling the package with `DEBUG` defined. Because this information was almost wholly redundant with existing methods of tracing available through ODBC driver managers, it was removed in v2.4.0.

Instead, tracing should be enabled through your driver manager, and that information can be analyzed and included with the description of issues encountered.

* **unixODBC (Linux, MacOS, IBM i):**

    In your `odbcinst.ini` file, add the following entry:
    ```
    [ODBC]
    Trace=yes
    TraceFile=/tmp/odbc.log
    ```
    Debug information will be appended to the trace file.

* **ODBC Data Source Administrator (Windows):**

    Open up ODBC Data Source Administrator and select the "Tracing" tab. Enter the location where you want the log file to go in **"Log File Path"**, then click **"Start Tracing Now"**.
---

## Drivers

---

## Important Changes in 3.0

* **Rewritten in Rust.** The C++ N-API addon was replaced by a Rust one built with
[napi-rs](https://napi.rs/). Prebuilt binaries ship in `prebuilds/`, so there is no
`node-gyp` step when installing.

* **Promise-only.** The callback API is gone: every asynchronous function returns a Promise.
Node.js 24 or later is required.

* **One thread per connection.** Every ODBC call for a connection runs on a thread that
connection owns, including connect and disconnect. The Actian/Ingres driver keeps session
state per thread and deadlocks when a connection-level call arrives from another live
thread; this is what makes that safe. Results are delivered without parking a libuv worker,
so concurrent queries no longer starve unrelated `fs`, `dns` and `crypto` work.

* **A smaller API.** `Cursor`, `callProcedure`, `primaryKeys`, `foreignKeys`, `cancel`,
`getUsername`, `setIsolationLevel`, the `autocommit`, `connectionTimeout` and `loginTimeout`
getters, and every query option (`cursor`, `fetchSize`, `timeout`, `initialBufferSize`,
`fetchArray`) have been removed. Use the pool's `initialStatements` for session setup such
as `SET SESSION ISOLATION LEVEL READ COMMITTED`.

* **Rows are fetched one at a time.** 2.x bound whole blocks of rows with `SQLBindCol`, which
is faster for large result sets but depends on driver support that not every driver has, and
is the machinery the removed `fetchSize` option configured. 3.0 reads rows with `SQLGetData`,
the most portable path ODBC offers. If you move large result sets and your driver handles
block fetches well, 2.x may be faster.

## Important Changes in 2.0

* **Timestamp and Datetime Changes:** SQL_DATETIME and SQL_TIMESTAMP no longer are automatically converted to UTC from how they were stored in the table. Previously, the assumption was that whatever was stored in the table was in "local time", and then converted to UTC. There is no guarantee that the time stored is in "local time", and many DBMSs store times without timezone data. Now, the driver will determine how to format the timestamps and datetimes that are returned, as it is retrieved simply as a String with no additional manipulation by this package.

---

## API

* [Connection](#Connection)
    * [constructor: odbc.connect()](#constructor-odbcconnectconnectionstring)
    * [.query()](#querysql-parameters)
    * [.createStatement()](#createstatement)
    * [.tables()](#tablescatalog-schema-table-type)
    * [.columns()](#columnscatalog-schema-table-column)
    * [.beginTransaction()](#begintransaction)
    * [.commit()](#commit)
    * [.rollback()](#rollback)
    * [.close()](#close)
    * [.connected](#connected)
* [Pool](#Pool)
    * [constructor: odbc.pool()](#constructor-odbcpoolconnectionstring)
    * [.connect()](#connect)
    * [.query()](#querysql-parameters-1)
    * [.close()](#close-1)
* [Statement](#Statement)
    * [.prepare()](#preparesql)
    * [.bind()](#bindparameters)
    * [.execute()](#execute)
    * [.close()](#close-2)

### **Promise-based API**

Every asynchronous function returns a native JavaScript `Promise`; there is no callback form. This package requires Node.js 24 or later, so `async`/`await` can be used everywhere without any compatibility shims.

_All examples are shown using IBM i Db2 DSNs and queries. Because ODBC is DBMS-agnostic, examples will work as long as the query strings are modified for your particular DBMS._

### **Result Array**

All functions that return a result set do so in an array, where each row in the result set is an entry in the array. Each row is returned as an object keyed by column name.

The result array also contains several properties:
* `count`: the number of rows affected by the statement or procedure. Returns the result from ODBC function SQLRowCount.
* `columns`: a list of columns in the result set. This is returned in an array. Each column in the array has the following properties:
  * `name`: The name of the column
  * `dataType`: The data type of the column properties
* `statement`: The statement used to return the result set
* `parameters`: The parameters passed to the statement or procedure. For input/output and output parameters, this value will reflect the value updated from a procedure.
* `return`: The return value from some procedures. For many DBMS, this will always be undefined.

```
[ { CUSNUM: 938472,
    LSTNAM: 'Henning ',
    INIT: 'G K',
    STREET: '4859 Elm Ave ',
    CITY: 'Dallas',
    STATE: 'TX',
    ZIPCOD: 75217,
    CDTLMT: 5000,
    CHGCOD: 3,
    BALDUE: 37,
    CDTDUE: 0 },
  { CUSNUM: 839283,
    LSTNAM: 'Jones   ',
    INIT: 'B D',
    STREET: '21B NW 135 St',
    CITY: 'Clay  ',
    STATE: 'NY',
    ZIPCOD: 13041,
    CDTLMT: 400,
    CHGCOD: 1,
    BALDUE: 100,
    CDTDUE: 0 },
  statement: 'SELECT * FROM QIWS.QCUSTCDT',
  parameters: [],
  return: undefined,
  count: -1,
  columns: [ { name: 'CUSNUM', dataType: 2 },
    { name: 'LSTNAM', dataType: 1 },
    { name: 'INIT', dataType: 1 },
    { name: 'STREET', dataType: 1 },
    { name: 'CITY', dataType: 1 },
    { name: 'STATE', dataType: 1 },
    { name: 'ZIPCOD', dataType: 2 },
    { name: 'CDTLMT', dataType: 2 },
    { name: 'CHGCOD', dataType: 2 },
    { name: 'BALDUE', dataType: 2 },
    { name: 'CDTDUE', dataType: 2 } ] ]
```

In this example, two rows are returned, with eleven columns each. The format of these columns is found on the `columns` property, with their names and dataType (which are integers mapped to SQL data types).

With this result structure, users can iterate over the result set like any old array (in this case, `results.length` would return 2) while also accessing important information from the SQL call and result set.

---
---

## **Connection**

A Connection is your means of connecting to the database through ODBC.

### `constructor: odbc.connect(connectionString)`

In order to get a connection, you must use the `.connect` function exported from the module. This asynchronously creates a Connection and gives it back to you, resolved as a Promise.

#### Parameters:
* **connectionString**: The connection string to connect to the database, usually by naming a DSN. Can also be a configuration object with the following properties:
    * `connectionString` **REQUIRED**: The connection string to connect to the database
    * `connectionTimeout`: The number of seconds to wait for a request on the connection to complete before returning to the application
    * `loginTimeout`: The number of seconds to wait for a login request to complete before returning to the application

#### Examples:

**Promises**

```javascript
const odbc = require('@lukaselmer/odbc');

async function connectToDatabase() {
    const connection1 = await odbc.connect('DSN=MYDSN');
    // connection1 is now an open Connection

    // or using a configuration object
    const connectionConfig = {
        connectionString: 'DSN=MYDSN',
        connectionTimeout: 10,
        loginTimeout: 10,
    }
    const connection2 = await odbc.connect(connectionConfig);
    // connection2 is now an open Connection
}

connectToDatabase();
```

Once a Connection has been created with `odbc.connect`, you can use the following functions on the connection:

---

### `.query(sql, parameters?)`

Run a query on the database. Can be passed an SQL string with parameter markers `?` and an array of parameters to bind to those markers. Returns a [result array](#result-array).

#### Parameters:
* **sql**: The SQL string to execute
* **parameters?**: An array of parameters to be bound the parameter markers (`?`)

```JavaScript
const odbc = require('@lukaselmer/odbc');

async function queryExample() {
    const connection = await odbc.connect(connectionString);
    const result = await connection.query('SELECT * FROM QIWS.QCUSTCDT');
    console.log(result);
}

queryExample();
```

---

### `.createStatement()`

Returns a [Statement](#Statement) object from the connection.

#### Examples:

**Promises**

```javascript
const odbc = require('@lukaselmer/odbc');

// can only use await keyword in an async function
async function statementExample() {
    const connection = await odbc.connect(`${process.env.CONNECTION_STRING}`);
    const statement = await connection.createStatement();
    // now have a statement where sql can be prepared, bound, and executed
}

statementExample();
```

---

### `.tables(catalog, schema, table, type)`

Returns a [result array](#result-array) listing the tables that match the given selectors, using ODBC's SQLTables. Pass `null` for any parameter to leave that part of the search unrestricted.

#### Parameters:
* **catalog**: The catalog to search, or `null` to search all catalogs.
* **schema**: The schema to search, or `null` to search all schemas.
* **table**: The table name to search for, or `null` to search all tables.
* **type**: A comma-separated list of table types to search for (e.g. `'TABLE,VIEW'`), or `null` to search all types.

#### Examples:

**Promises**

```javascript
const odbc = require('@lukaselmer/odbc');

async function tablesExample() {
    const connection = await odbc.connect(`${process.env.CONNECTION_STRING}`);
    const tables = await connection.tables(null, 'MY_SCHEMA', null, null);
    console.log(tables);
}

tablesExample();
```

---

### `.columns(catalog, schema, table, column)`

Returns a [result array](#result-array) listing the columns that match the given selectors, using ODBC's SQLColumns. Pass `null` for any parameter to leave that part of the search unrestricted.

#### Parameters:
* **catalog**: The catalog to search, or `null` to search all catalogs.
* **schema**: The schema to search, or `null` to search all schemas.
* **table**: The table name to search for, or `null` to search all tables.
* **column**: The column name to search for, or `null` to search all columns.

#### Examples:

**Promises**

```javascript
const odbc = require('@lukaselmer/odbc');

async function columnsExample() {
    const connection = await odbc.connect(`${process.env.CONNECTION_STRING}`);
    const columns = await connection.columns(null, 'MY_SCHEMA', 'MY_TABLE', null);
    console.log(columns);
}

columnsExample();
```

---

### `.beginTransaction()`

Begins a transaction on the connection. The transaction can be committed by calling `.commit` or rolled back by calling `.rollback`. **If a connection is closed with an open transaction, it will be rolled back.** Connection isolation level will affect the data that other transactions can view mid transaction.

#### Examples:

**Promises**

```javascript
const odbc = require('@lukaselmer/odbc');

// can only use await keyword in an async function
async function transaction() {
    const connection = await odbc.connect(`${process.env.CONNECTION_STRING}`);
    await connection.beginTransaction();
    // transaction is now open
}

transaction();
```

---

### `.commit()`

Commits an open transaction. If called on a connection that doesn't have an open transaction, will no-op.

#### Examples:

**Promises**

```javascript
const odbc = require('@lukaselmer/odbc');

// can only use await keyword in an async function
async function commitTransaction() {
    const connection = await odbc.connect(`${process.env.CONNECTION_STRING}`);
    await connection.beginTransaction();
    const insertResult = await connection.query('INSERT INTO MY_TABLE VALUES(1, \'Name\')');
    await connection.commit();
    // INSERT query has now been committed
}

commitTransaction();
```

---


### `.rollback()`

Rolls back an open transaction. If called on a connection that doesn't have an open transaction, will no-op.

#### Examples:

**Promises**

```javascript
const odbc = require('@lukaselmer/odbc');

// can only use await keyword in an async function
async function rollbackTransaction() {
    const connection = await odbc.connect(`${process.env.CONNECTION_STRING}`);
    await connection.beginTransaction();
    const insertResult = await connection.query('INSERT INTO MY_TABLE VALUES(1, \'Name\')');
    await connection.rollback();
    // INSERT query has now been rolled back
}

rollbackTransaction();
```

---

### `.close()`

Closes an open connection. Any transactions on the connection that have not been ended will be rolledback.

#### Examples:

**Promises**

```javascript
const odbc = require('@lukaselmer/odbc');

// can only use await keyword in an async function
async function closeConnection() {
    const connection = await odbc.connect(`${process.env.CONNECTION_STRING}`);
    // do something with your connection here
    await connection.close();
}

closeConnection();
```

---

### `.connected`

A synchronous boolean getter reporting whether the driver still considers the connection to be up. Reading it never blocks on an in-flight query; while the connection is busy, it reports the last known state instead.

#### Examples:

```javascript
const odbc = require('@lukaselmer/odbc');

async function checkConnection() {
    const connection = await odbc.connect(`${process.env.CONNECTION_STRING}`);
    console.log(connection.connected); // true
    await connection.close();
    console.log(connection.connected); // false
}

checkConnection();
```

---
---


### **Pool**

### `constructor: odbc.pool(connectionString)`

In order to get a Pool, you must use the `.pool` function exported from the module. This asynchronously creates a Pool of a number of Connections and returns it to you as a Promise.

Note that `odbc.pool` will resolve as soon as it has created 1 connection. It will continue to spin up Connections and add them to the Pool in the background, but by returning early it will allow you to use the Pool as soon as possible.

#### Parameters:
* **connectionString**: The connection string to connect to the database for all connections in the pool, usually by naming a DSN. Can also be a configuration object with the following properties:
    * `connectionString` **REQUIRED**: The connection string to connect to the database
    * `connectionTimeout`: The number of seconds to wait for a request on the connection to complete before returning to the application
    * `loginTimeout`: The number of seconds to wait for a login request to complete before returning to the application
    * `initialSize`: The initial number of Connections created in the Pool
    * `incrementSize`: How many additional Connections to create when all of the Pool's connections are taken
    * `maxSize`: The maximum number of open Connections the Pool will create
    * `reuseConnections`: Whether or not to reuse an existing Connection instead of creating a new one
    * `shrink`: Whether or not the number of Connections should shrink to `initialSize` as they free up
    * `initialStatements`: SQL run on each new Connection before it is handed out, for session setup such as `SET SESSION ISOLATION LEVEL READ COMMITTED`. A Connection whose initial statements fail is closed and never used.

#### Examples:

**Promises**

```JavaScript
const odbc = require('@lukaselmer/odbc');

// can only use await keyword in an async function
async function createPool() {
    const pool = await odbc.pool(`${process.env.CONNECTION_STRING}`);
    // can now do something with the Pool
}

createPool();
```

### `.connect()`

Returns a [Connection](#connection) object for you to use from the Pool. Doesn't actually open a connection, because they are already open in the pool when `.init` is called.

#### Examples:

**Promises**

```javascript
const odbc = require('@lukaselmer/odbc');

// can only use await keyword in an async function
async function connectExample() {
    const pool = await odbc.pool(`${process.env.CONNECTION_STRING}`);
    const connection = await pool.connect();
    // now have a Connection to do work with
}

connectExample();
```

---

### `.query(sql, parameters?)`

Utility function to execute a query on any open connection in the pool. Will get a connection, fire off the query, return the results, and return the connection the the pool.

#### Parameters:
* **sql**: An SQL string that will be executed. Can optionally be given parameter markers (`?`) and also given an array of values to bind to the parameters.
* **parameters?**: An array of values to bind to the parameter markers, if there are any. The number of values in this array must match the number of parameter markers in the sql statement.

#### Examples:

**Promises**

```javascript
const odbc = require('@lukaselmer/odbc');

// can only use await keyword in an async function
async function queryExample() {
    const pool = await odbc.pool(`${process.env.CONNECTION_STRING}`);
    const result = await pool.query('SELECT * FROM MY_TABLE');
    console.log(result);
}

queryExample();
```

---

### `.close()`

Closes the entire pool of currently unused connections. Will not close connections that are checked-out, but will discard the connections when they are closed with Connection's `.close` function. After calling close, must create a new Pool sprin up new Connections.

#### Examples:

**Promises**

```javascript
const odbc = require('@lukaselmer/odbc');

// can only use await keyword in an async function
async function closeExample() {
    const pool = await odbc.pool(`${process.env.CONNECTION_STRING}`);
    await pool.close();
    // pool is now closed
}

closeExample();
```

---
---

## **Statement**

A Statement object is created from a Connection, and cannot be created _ad hoc_ with a constructor.

Statements allow you to prepare a commonly used statement, then bind parameters to it multiple times, executing in between.

---

### `.prepare(sql)`

Prepares an SQL statement, with or without parameters (?) to bind to.

#### Parameters:
* **sql**: An SQL string that is prepared and can be executed with the .`execute` function.

#### Examples:

**Promises**

```javascript
const odbc = require('@lukaselmer/odbc');

// can only use await keyword in an async function
async function prepareExample() {
    const connection = await odbc.connect(`${process.env.CONNECTION_STRING}`);
    const statement = await connection.createStatement();
    await statement.prepare('INSERT INTO MY_TABLE VALUES(?, ?)');
    // statement has been prepared, can bind and execute
}

prepareExample();
```

---

### `.bind(parameters)`

Binds an array of values to the parameters on the prepared SQL statement. Cannot be called before `.prepare`.

#### Parameters:
* **parameters**: An array of values to bind to the sql statement previously prepared. All parameters will be input parameters. The number of values passed in the array must match the number of parameters to bind to in the prepared statement.

#### Examples:

**Promises**

```javascript
const odbc = require('@lukaselmer/odbc');

// can only use await keyword in an async function
async function bindExample() {
    const connection = await odbc.connect(`${process.env.CONNECTION_STRING}`);
    const statement = await connection.createStatement();
    await statement.prepare('INSERT INTO MY_TABLE VALUES(?, ?)');
    // Assuming MY_TABLE has INTEGER and VARCHAR fields.
    await statement.bind([1, 'Name']);
    // statement has been prepared and values bound, can now execute
}

bindExample();
```

---

### `.execute()`

Executes the prepared and optionally bound SQL statement.

#### Examples:

**Promises**

```javascript
const odbc = require('@lukaselmer/odbc');

// can only use await keyword in an async function
async function executeExample() {
    const connection = await odbc.connect(`${process.env.CONNECTION_STRING}`);
    const statement = await connection.createStatement();
    await statement.prepare('INSERT INTO MY_TABLE VALUES(?, ?)');
    // Assuming MY_TABLE has INTEGER and VARCHAR fields.
    await statement.bind([1, 'Name']);
    const result = await statement.execute();
    console.log(result);

}

executeExample();
```

---

### `.close()`

Closes the Statement, freeing the statement handle. Running functions on the statement after closing will result in an error.

#### Examples:

**Promises**

```javascript
const odbc = require('@lukaselmer/odbc');

// can only use await keyword in an async function
async function closeStatementExample() {
    const connection = await odbc.connect(`${process.env.CONNECTION_STRING}`);
    const statement = await connection.createStatement();
    await statement.prepare('INSERT INTO MY_TABLE VALUES(?, ?)');
    // Assuming MY_TABLE has INTEGER and VARCHAR fields.
    await statement.bind([1, 'Name']);
    const result = await statement.execute();
    console.log(result);
    await statement.close();
}

closeStatementExample();
```

---
---

## Future improvements

Development of `node-odbc` is an ongoing endeavor, and there are many planned improvements for the package. If you would like to see something, simply add it to the Issues and we will respond!

## contributors

* Mark Irish (mirish@ibm.com)
* Dan VerWeire (dverweire@gmail.com)
* Lee Smith (notwink@gmail.com)
* Bruno Bigras
* Christian Ensel
* Yorick
* Joachim Kainz
* Oleg Efimov
* paulhendrix

license
-------

* Copyright (c) 2019, 2021 IBM
* Copyright (c) 2013 Dan VerWeire <dverweire@gmail.com>
* Copyright (c) 2010 Lee Smith <notwink@gmail.com>

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies ofthe Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
