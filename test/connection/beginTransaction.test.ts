import { describe, expect, it } from 'vitest'
import { connect } from '../../lib/index.ts'
import type { Connection } from '../../lib/index.ts'
import { connectionString, firstRow, qualifiedTable } from '../helpers.ts'

type Row = { ID: number; NAME: string; AGE: number }

describe('.beginTransaction()', () => {
  it('is idempotent when called multiple times before rollback', async () => {
    const connection = await connect(connectionString())
    await connection.beginTransaction()
    const inserted = await connection.query(
      `INSERT INTO ${qualifiedTable()} VALUES(2, 'rolledback', 20)`,
    )
    expect(inserted.length).toBe(0)
    const afterInsert = await connection.query<Row>(`SELECT * FROM ${qualifiedTable()}`)
    expect(afterInsert.length).toBe(1)
    expect(firstRow(afterInsert)).toEqual({ ID: 2, NAME: 'rolledback', AGE: 20 })
    await connection.beginTransaction()
    const afterSecondBegin = await connection.query<Row>(`SELECT * FROM ${qualifiedTable()}`)
    expect(afterSecondBegin.length).toBe(1)
    expect(firstRow(afterSecondBegin)).toEqual({ ID: 2, NAME: 'rolledback', AGE: 20 })
    await connection.rollback()
    const afterRollback = await connection.query(`SELECT * FROM ${qualifiedTable()}`)
    expect(afterRollback.length).toBe(0)
    await connection.close()
  })

  it('is idempotent when called multiple times before commit', async () => {
    const connection = await connect(connectionString())
    await connection.beginTransaction()
    const inserted = await connection.query(`INSERT INTO ${qualifiedTable()} VALUES(1, 'committed', 10)`)
    expect(inserted.length).toBe(0)
    const afterInsert = await connection.query<Row>(`SELECT * FROM ${qualifiedTable()}`)
    expect(afterInsert.length).toBe(1)
    expect(firstRow(afterInsert)).toEqual({ ID: 1, NAME: 'committed', AGE: 10 })
    await connection.beginTransaction()
    const afterSecondBegin = await connection.query<Row>(`SELECT * FROM ${qualifiedTable()}`)
    expect(afterSecondBegin.length).toBe(1)
    expect(firstRow(afterSecondBegin)).toEqual({ ID: 1, NAME: 'committed', AGE: 10 })
    await connection.commit()
    const afterCommit = await connection.query<Row>(`SELECT * FROM ${qualifiedTable()}`)
    expect(afterCommit.length).toBe(1)
    expect(firstRow(afterCommit)).toEqual({ ID: 1, NAME: 'committed', AGE: 10 })
    await connection.close()
  })

  it('keeps transactional inserts visible only to the writer until commit (read committed)', async () => {
    const [connection1, connection2] = await openTransactionIsolationPair()
    await connection1.beginTransaction()
    const inserted = await connection1.query(
      `INSERT INTO ${qualifiedTable()} VALUES(1, 'committed', 10)`,
    )
    expect(inserted).not.toBeNull()
    const seenByWriter = await connection1.query<Row>(`SELECT * FROM ${qualifiedTable()} t1`)
    expect(seenByWriter.length).toBe(1)
    expect(firstRow(seenByWriter)).toEqual({ ID: 1, NAME: 'committed', AGE: 10 })
    const seenByReader = await connection2.query(`SELECT * FROM ${qualifiedTable()} t2`)
    expect(seenByReader.length).toBe(0)
    await connection1.commit()
    const seenAfterCommit = await connection2.query<Row>(`SELECT * FROM ${qualifiedTable()}`)
    expect(seenAfterCommit.length).toBe(1)
    expect(firstRow(seenAfterCommit)).toEqual({ ID: 1, NAME: 'committed', AGE: 10 })
    await connection1.close()
    await connection2.close()
  })

  it('does not hide queries that occur on other connections', async () => {
    const connection1 = await connect(connectionString())
    const connection2 = await connect(connectionString())
    await connection1.beginTransaction()
    const inserted = await connection2.query(
      `INSERT INTO ${qualifiedTable()} VALUES(1, 'committed', 10)`,
    )
    expect(inserted).not.toBeNull()
    const seen = await connection1.query<Row>(`SELECT * FROM ${qualifiedTable()}`)
    expect(seen.length).toBe(1)
    expect(firstRow(seen)).toEqual({ ID: 1, NAME: 'committed', AGE: 10 })
    await connection1.close()
    await connection2.close()
  })
})

/** Ingres/DB2/SQL Server need explicit isolation flags; Postgres defaults to read committed. */
async function openTransactionIsolationPair(): Promise<[Connection, Connection]> {
  const dbms = process.env.DBMS
  if (dbms === 'ibmi') {
    return [
      await connect(`${connectionString()};CMT=1`),
      await connect(`${connectionString()};CMT=1;CONCURRENTACCESSRESOLUTION=1`),
    ]
  }
  if (dbms === 'mssql') {
    return [
      await connect(connectionString()),
      await connect(`${connectionString()};DMConnAttr=[1227]=32`),
    ]
  }
  return [await connect(connectionString()), await connect(connectionString())]
}
