const assert = require('assert')
const odbc = require('../../lib/odbc')

// Regression tests for ODBC diagnostic-record retrieval (ODBCAsyncWorker::GetODBCErrors).
//
// A misbehaving driver can make that code read uninitialised memory, write into a freed buffer
// and fabricate diagnostic records. On Ingres/Actian this aborts the Node process; on PostgreSQL
// it surfaces as phantom records and mangled messages. See
// docs/plan-ingres-syntax-error-crash.md.

const NO_INFO = '<No error information available>'

// A statement that every supported DBMS rejects while parsing.
const INVALID_SQL = 'SELEC 1'

function assertUsableOdbcErrors(error, context) {
  assert.notStrictEqual(error, null, `${context}: expected the query to be rejected`)
  assert.ok(Array.isArray(error.odbcErrors), `${context}: odbcErrors must be an array`)
  assert.ok(error.odbcErrors.length > 0, `${context}: odbcErrors must not be empty`)

  error.odbcErrors.forEach((odbcError, index) => {
    assert.strictEqual(
      typeof odbcError.message, 'string',
      `${context}: odbcErrors[${index}].message must be a string`,
    )
    assert.notStrictEqual(
      odbcError.message, NO_INFO,
      `${context}: odbcErrors[${index}] is a phantom record (${NO_INFO}); the driver reported `
      + 'more diagnostic records than it actually has',
    )
    assert.ok(
      odbcError.message.length > 0,
      `${context}: odbcErrors[${index}].message must not be empty`,
    )
    assert.strictEqual(
      typeof odbcError.state, 'string',
      `${context}: odbcErrors[${index}].state must be a string`,
    )
    assert.ok(
      odbcError.state.length > 0,
      `${context}: odbcErrors[${index}].state must not be empty`,
    )
    assert.ok(
      odbcError.state.length <= 5,
      `${context}: odbcErrors[${index}].state must be a 5-character SQLSTATE, got `
      + JSON.stringify(odbcError.state),
    )
  })
}

// Produces a server-side error whose message is `length` characters long, so that the diagnostic
// buffer has to grow. Only PostgreSQL is scripted here; other DBMSs skip these cases.
function longErrorQuery(length) {
  if (global.dbms !== 'postgres' && global.dbms !== 'postgresql') return null
  return `DO $$ BEGIN RAISE EXCEPTION '%', repeat('a', ${length}); END $$;`
}

describe('...error diagnostics...', () => {
  let connection = null

  beforeEach(async () => {
    connection = await odbc.connect(`${process.env.CONNECTION_STRING}`)
  })

  afterEach(async () => {
    await connection.close()
    connection = null
  })

  it('...should reject invalid SQL with usable ODBC errors.', async () => {
    let caught = null
    try {
      await connection.query(INVALID_SQL)
    }
    catch (error) {
      caught = error
    }
    assertUsableOdbcErrors(caught, 'invalid SQL')
  })

  it('...should report exactly the diagnostic records the driver has.', async () => {
    let caught = null
    try {
      await connection.query(INVALID_SQL)
    }
    catch (error) {
      caught = error
    }
    assert.notStrictEqual(caught, null)
    const phantoms = caught.odbcErrors.filter(odbcError => odbcError.message === NO_INFO)
    assert.deepStrictEqual(
      phantoms, [],
      `expected no phantom records, got ${phantoms.length} of ${caught.odbcErrors.length}`,
    )
  })

  it('...should reject a reference to a missing table with usable ODBC errors.', async () => {
    let caught = null
    try {
      await connection.query('SELECT * FROM a_table_that_does_not_exist_9f3a')
    }
    catch (error) {
      caught = error
    }
    assertUsableOdbcErrors(caught, 'missing table')
  })

  it('...should return long error messages in one piece.', async function () {
    const sql = longErrorQuery(8000)
    if (!sql) return this.skip()

    let caught = null
    try {
      await connection.query(sql)
    }
    catch (error) {
      caught = error
    }
    assertUsableOdbcErrors(caught, 'long error message')

    // A long message must not come back as a series of chunks pretending to be separate
    // diagnostic records.
    assert.strictEqual(
      caught.odbcErrors.length, 1,
      `a single server error must produce a single record, got ${caught.odbcErrors.length}`,
    )

    // Drivers cap how much of a message they keep (psqlodbc truncates at 4095 characters), so the
    // exact length is not asserted. What matters is that the message is one unbroken run that is
    // longer than the initial diagnostic buffer, which only happens when that buffer is grown
    // correctly.
    const message = caught.odbcErrors[0].message
    const longestRun = (message.match(/a+/g) ?? [])
      .reduce((longest, candidate) => Math.max(longest, candidate.length), 0)
    assert.ok(
      longestRun > 2048,
      `expected a contiguous message longer than the 2048-character initial buffer, got ${longestRun}`,
    )
    assert.ok(
      message.startsWith('ERROR'),
      `expected the message to start at the beginning, got ${JSON.stringify(message.slice(0, 40))}`,
    )
  })

  it('...should survive many consecutive failing queries.', async () => {
    for (let i = 0; i < 200; i++) {
      try {
        await connection.query(INVALID_SQL)
        assert.fail('invalid SQL should not resolve')
      }
      catch (error) {
        assert.ok(Array.isArray(error.odbcErrors) && error.odbcErrors.length > 0)
      }
    }
  })

  it('...should provide usable ODBC errors through the callback API.', (done) => {
    connection.query(INVALID_SQL, (error) => {
      try {
        assertUsableOdbcErrors(error, 'callback API')
        done()
      }
      catch (assertionError) {
        done(assertionError)
      }
    })
  })

  it('...should provide usable ODBC errors when preparing or executing an invalid statement.', async () => {
    const statement = await connection.createStatement()
    let caught = null
    try {
      // Some drivers parse at prepare time, others defer until execute; either may raise.
      await statement.prepare(INVALID_SQL)
      await statement.execute()
    }
    catch (error) {
      caught = error
    }
    assertUsableOdbcErrors(caught, 'statement.prepare/execute')
    await statement.close()
  })

  it('...should provide usable ODBC errors from a pool.', async () => {
    const pool = await odbc.pool(`${process.env.CONNECTION_STRING}`)
    let caught = null
    try {
      await pool.query(INVALID_SQL)
    }
    catch (error) {
      caught = error
    }
    try {
      assertUsableOdbcErrors(caught, 'pool.query')
    }
    finally {
      await pool.close()
    }
  })
})
