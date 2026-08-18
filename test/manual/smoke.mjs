import odbc from '../../lib/odbc.js'
import assert from 'node:assert/strict'

const CS = process.env.SMOKE_CONNECTION_STRING
if (!CS) {
  console.error('Set SMOKE_CONNECTION_STRING, e.g. DSN=PGRUSTPORT;UID=me')
  process.exit(1)
}
const TABLE = process.env.SMOKE_TABLE ?? 'rustsmoke'
const ok = (m) => console.log('  ✓', m)

const connection = await odbc.connect(CS)

// --- reads ---------------------------------------------------------------
const rows = await connection.query(`SELECT * FROM ${TABLE} ORDER BY id`)
assert.equal(rows.length, 2)
assert.equal(rows[0].name, 'anna')
assert.equal(rows[0].bignum, 9007199254740993n)
assert.equal(rows[1].age, null)
assert.ok(Buffer.isBuffer(rows[0].payload))
assert.deepEqual([...rows[0].payload], [1, 2])
ok('rows, types, nulls, bigint precision, binary')

assert.equal(rows.statement, `SELECT * FROM ${TABLE} ORDER BY id`)
assert.equal(rows.columns.length, 6)
assert.deepEqual(rows.columns[0], {
  name: 'id', dataType: 4, dataTypeName: 'SQL_INTEGER',
  columnSize: 10, decimalDigits: 0, nullable: false,
})
assert.equal(rows.return, undefined)
ok('result metadata: statement, columns, return')

// --- parameters ----------------------------------------------------------
const one = await connection.query(`SELECT * FROM ${TABLE} WHERE id = ?`, [1])
assert.equal(one.length, 1)
assert.equal(one[0].name, 'anna')

const byName = await connection.query(`SELECT * FROM ${TABLE} WHERE name = ?`, ['bob'])
assert.equal(byName[0].id, 2)

const nullParam = await connection.query(`SELECT * FROM ${TABLE} WHERE age IS NOT DISTINCT FROM ?`, [null])
assert.equal(nullParam.length, 1)
assert.equal(nullParam[0].id, 2)
ok('parameters: number, string, null')

// --- writes report affected rows ----------------------------------------
const inserted = await connection.query(`INSERT INTO ${TABLE} VALUES (3, 'carol', 7, 1, 0.5, NULL)`)
assert.equal(inserted.length, 0)
assert.equal(inserted.count, 1)

const updated = await connection.query(`UPDATE ${TABLE} SET age = 8 WHERE id = 3`)
assert.equal(updated.count, 1)

const deleted = await connection.query(`DELETE FROM ${TABLE} WHERE id = 3`)
assert.equal(deleted.count, 1)
ok('INSERT/UPDATE/DELETE report count')

// --- prepared statements -------------------------------------------------
const statement = await connection.createStatement()
await statement.prepare(`SELECT * FROM ${TABLE} WHERE id = ?`)
await statement.bind([2])
const prepared = await statement.execute()
assert.equal(prepared.length, 1)
assert.equal(prepared[0].name, 'bob')
await statement.close()
ok('prepare / bind / execute / close')

// --- transactions --------------------------------------------------------
await connection.beginTransaction()
await connection.query(`INSERT INTO ${TABLE} VALUES (9, 'rolled back', 1, 1, 1, NULL)`)
await connection.rollback()
assert.equal((await connection.query(`SELECT * FROM ${TABLE} WHERE id = 9`)).length, 0)

await connection.beginTransaction()
await connection.query(`INSERT INTO ${TABLE} VALUES (9, 'committed', 1, 1, 1, NULL)`)
await connection.commit()
assert.equal((await connection.query(`SELECT * FROM ${TABLE} WHERE id = 9`)).length, 1)
await connection.query(`DELETE FROM ${TABLE} WHERE id = 9`)
ok('transactions: rollback and commit')

// --- errors carry odbcErrors --------------------------------------------
await assert.rejects(connection.query('SELEC nonsense'), (error) => {
  assert.ok(Array.isArray(error.odbcErrors), 'odbcErrors is an array')
  assert.ok(error.odbcErrors.length > 0, 'odbcErrors is not empty')
  assert.equal(typeof error.odbcErrors[0].state, 'string')
  assert.equal(typeof error.odbcErrors[0].code, 'number')
  assert.ok(error.odbcErrors[0].message.length > 0)
  return true
})
ok('errors carry state/code/message')

// a failed statement must leave the connection usable
assert.equal((await connection.query('SELECT 1 AS one'))[0].one, 1)
ok('connection survives a failed statement')

await connection.close()
ok('close')

// --- pool, with the isolation level set as session SQL -------------------
const pool = await odbc.pool({
  connectionString: CS,
  initialSize: 2,
  initialStatements: ['SET SESSION CHARACTERISTICS AS TRANSACTION ISOLATION LEVEL READ COMMITTED'],
})
const pooled = await pool.connect()
const level = await pooled.query('SHOW transaction_isolation')
assert.equal(level[0].transaction_isolation, 'read committed')
ok(`pool initialStatements applied: ${level[0].transaction_isolation}`)
await pooled.close()
await pool.close()
ok('pool close')

console.log('\nAll smoke tests passed.')
