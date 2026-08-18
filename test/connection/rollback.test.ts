import { describe, expect, it } from 'vitest'
import { connect } from '../../lib/index.ts'
import { connectionString, firstRow, qualifiedTable, rowAt } from '../helpers.ts'

type Row = { ID: number; NAME: string; AGE: number }

describe('.rollback()', () => {
  it('rolls back all queries made after beginTransaction was called', async () => {
    const connection = await connect(connectionString())
    await connection.beginTransaction()
    const inserted = await connection.query(
      `INSERT INTO ${qualifiedTable()} VALUES(2, 'rolledback', 20)`,
    )
    expect(inserted).not.toBeNull()
    const beforeRollback = await connection.query<Row>(`SELECT * FROM ${qualifiedTable()}`)
    expect(beforeRollback.length).toBe(1)
    expect(firstRow(beforeRollback)).toEqual({ ID: 2, NAME: 'rolledback', AGE: 20 })
    await connection.rollback()
    const afterRollback = await connection.query(`SELECT * FROM ${qualifiedTable()}`)
    expect(afterRollback.length).toBe(0)
    await connection.close()
  })

  it('does not roll back commits made before beginTransaction was called', async () => {
    const connection = await connect(connectionString())
    const firstInsert = await connection.query(
      `INSERT INTO ${qualifiedTable()} VALUES(1, 'committed', 10)`,
    )
    expect(firstInsert).not.toBeNull()
    expect(firstInsert.count).toBe(1)
    const afterFirstInsert = await connection.query<Row>(`SELECT * FROM ${qualifiedTable()}`)
    expect(afterFirstInsert.length).toBe(1)
    expect(firstRow(afterFirstInsert)).toEqual({ ID: 1, NAME: 'committed', AGE: 10 })
    await connection.beginTransaction()
    const secondInsert = await connection.query(
      `INSERT INTO ${qualifiedTable()} VALUES(2, 'rolledback', 20)`,
    )
    expect(secondInsert).not.toBeNull()
    expect(secondInsert.count).toBe(1)
    const afterSecondInsert = await connection.query<Row>(`SELECT * FROM ${qualifiedTable()}`)
    expect(afterSecondInsert.length).toBe(2)
    expect(rowAt(afterSecondInsert, 1)).toEqual({ ID: 2, NAME: 'rolledback', AGE: 20 })
    await connection.rollback()
    const afterRollback = await connection.query<Row>(`SELECT * FROM ${qualifiedTable()}`)
    expect(afterRollback.length).toBe(1)
    expect(firstRow(afterRollback)).toEqual({ ID: 1, NAME: 'committed', AGE: 10 })
    await connection.close()
  })

  it('has no effect when beginTransaction has not been called', async () => {
    const connection = await connect(connectionString())
    const inserted = await connection.query(`INSERT INTO ${qualifiedTable()} VALUES(1, 'committed', 10)`)
    expect(inserted).not.toBeNull()
    expect(inserted.count).toBe(1)
    const afterInsert = await connection.query<Row>(`SELECT * FROM ${qualifiedTable()}`)
    expect(afterInsert.length).toBe(1)
    expect(firstRow(afterInsert)).toEqual({ ID: 1, NAME: 'committed', AGE: 10 })
    await connection.rollback()
    const afterRollback = await connection.query<Row>(`SELECT * FROM ${qualifiedTable()}`)
    expect(afterRollback.length).toBe(1)
    expect(firstRow(afterRollback)).toEqual({ ID: 1, NAME: 'committed', AGE: 10 })
    await connection.close()
  })

  it('has no effect when called after a transaction already ended with commit', async () => {
    const connection = await connect(connectionString())
    await connection.beginTransaction()
    const inserted = await connection.query(`INSERT INTO ${qualifiedTable()} VALUES(1, 'committed', 10)`)
    expect(inserted).not.toBeNull()
    expect(inserted.count).toBe(1)
    await connection.commit()
    const afterCommit = await connection.query<Row>(`SELECT * FROM ${qualifiedTable()}`)
    expect(afterCommit.length).toBe(1)
    expect(firstRow(afterCommit)).toEqual({ ID: 1, NAME: 'committed', AGE: 10 })
    await connection.rollback()
    const afterRollback = await connection.query<Row>(`SELECT * FROM ${qualifiedTable()}`)
    expect(afterRollback.length).toBe(1)
    expect(firstRow(afterRollback)).toEqual({ ID: 1, NAME: 'committed', AGE: 10 })
    await connection.close()
  })

  it('has no effect when called after a transaction already ended with rollback', async () => {
    const connection = await connect(connectionString())
    await connection.beginTransaction()
    const firstInsert = await connection.query(
      `INSERT INTO ${qualifiedTable()} VALUES(1, 'committed', 10)`,
    )
    expect(firstInsert).not.toBeNull()
    expect(firstInsert.count).toBe(1)
    await connection.rollback()
    const secondInsert = await connection.query(
      `INSERT INTO ${qualifiedTable()} VALUES(1, 'committed', 10)`,
    )
    expect(secondInsert).not.toBeNull()
    expect(secondInsert.count).toBe(1)
    const afterSecondInsert = await connection.query<Row>(`SELECT * FROM ${qualifiedTable()}`)
    expect(afterSecondInsert.length).toBe(1)
    expect(firstRow(afterSecondInsert)).toEqual({ ID: 1, NAME: 'committed', AGE: 10 })
    await connection.rollback()
    const afterSecondRollback = await connection.query<Row>(`SELECT * FROM ${qualifiedTable()}`)
    expect(afterSecondRollback.length).toBe(1)
    expect(firstRow(afterSecondRollback)).toEqual({ ID: 1, NAME: 'committed', AGE: 10 })
    await connection.close()
  })
})
