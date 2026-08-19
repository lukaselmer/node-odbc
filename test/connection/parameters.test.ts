import { describe, expect, it } from 'vitest'
import { connect } from '../../lib/index.ts'
import { connectionString, firstRow, qualifiedTable } from '../helpers.ts'

type Row = { ID: number; NAME: string; AGE: number }

describe('parameter binding', () => {
  it('binds a BigInt', async () => {
    const connection = await connect(connectionString())

    const rows = await connection.query(`SELECT * FROM ${qualifiedTable()} WHERE ID = ?`, [1n])

    expect(rows.length).toBe(0)
    await connection.close()
  })

  it('round-trips a whole number through an integer column', async () => {
    const connection = await connect(connectionString())
    await connection.query(`INSERT INTO ${qualifiedTable()} VALUES(?, ?, ?)`, [7, 'bound', 42])

    const rows = await connection.query<Row>(`SELECT * FROM ${qualifiedTable()} WHERE ID = ?`, [7])

    expect(firstRow(rows)).toEqual({ ID: 7, NAME: 'bound', AGE: 42 })
    await connection.query(`DELETE FROM ${qualifiedTable()} WHERE ID = ?`, [7])
    await connection.close()
  })

  /**
   * A whole number has to reach the driver as an integer: Ingres rejects a
   * floating point host variable where its grammar demands an integer, which
   * `LIMIT ?` does. PostgreSQL reports the type it was given, and infers
   * nothing here because the parameter stands alone.
   */
  it.skipIf(process.env.DBMS !== 'postgres')('binds a whole number as an integer', async () => {
    const connection = await connect(connectionString())

    const rows = await connection.query<{ t: string }>('SELECT pg_typeof(?) AS t', [42])

    expect(firstRow(rows)).toEqual({ T: 'bigint' })
    await connection.close()
  })

  it.skipIf(process.env.DBMS !== 'postgres')(
    'binds a fractional number without truncating it',
    async () => {
      const connection = await connect(connectionString())

      const rows = await connection.query<{ v: number }>(
        'SELECT CAST(? AS DOUBLE PRECISION) AS v',
        [1.5],
      )

      expect(firstRow(rows)).toEqual({ V: 1.5 })
      await connection.close()
    },
  )
})
