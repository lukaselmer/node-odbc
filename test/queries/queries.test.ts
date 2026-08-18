import { describe, expect, it } from 'vitest'
import { connect } from '../../lib/index.ts'
import { connectionString, firstRow } from '../helpers.ts'

type IntegerBoundsRow = { TEST1: number; TEST2: number; TEST3: number }

describe('queries', () => {
  it('passes w1nk/node-odbc issue #54', async () => {
    const connection = await connect(connectionString())
    const fromClause = process.env.DBMS === 'ibmi' ? 'from sysibm.sysdummy1' : ''
    const result = await connection.query<IntegerBoundsRow>(
      `select cast(-1 as INTEGER) as TEST1, cast(-2147483648 as INTEGER) as TEST2, cast(2147483647 as INTEGER) as TEST3 ${fromClause}`,
    )
    expect(result.length).toBe(1)
    const row = firstRow(result)
    expect(row.TEST1).toBe(-1)
    expect(row.TEST2).toBe(-2147483648)
    expect(row.TEST3).toBe(2147483647)
    await connection.close()
  })

  it('passes w1nk/node-odbc issue #85', async () => {
    const connection = await connect(connectionString())
    const fromClause = process.env.DBMS === 'ibmi' ? 'from sysibm.sysdummy1' : ''
    const result = await connection.query<IntegerBoundsRow>(
      `select cast(-1 as INTEGER) as TEST1, cast(-2147483648 as INTEGER) as TEST2, cast(2147483647 as INTEGER) as TEST3 ${fromClause}`,
    )
    expect(result.length).toBe(1)
    const row = firstRow(result)
    expect(row.TEST1).toBe(-1)
    expect(row.TEST2).toBe(-2147483648)
    expect(row.TEST3).toBe(2147483647)
    await connection.close()
  })

  it.skipIf(process.env.DBMS !== 'ibmi')(
    // Uses IBMi-specific SQL types (CLOB, DBCLOB) and sysibm.sysdummy1
    'retrieves data from SQL_(W)LONG data types',
    async () => {
      const connection = await connect(connectionString())
      const alphabet = 'abcdefghijklmnopqrstuvwxyz'
      const result = await connection.query<{
        SQL_LONGVARCHAR_FIELD: string
        SQL_WLONGVARCHAR_FIELD: string
        SQL_LONGVARBINARY_FIELD: ArrayBuffer
      }>(
        `select cast ('${alphabet}' as CLOB) as SQL_LONGVARCHAR_FIELD, cast ('${alphabet}' as DBCLOB CCSID 1200) as SQL_WLONGVARCHAR_FIELD, cast (cast('${alphabet}' as CLOB CCSID 1208) as BLOB) as SQL_LONGVARBINARY_FIELD from sysibm.sysdummy1`,
      )
      expect(result.length).toBe(1)

      const row = result[0]
      if (!row) throw new Error('expected a row')
      expect(row.SQL_LONGVARCHAR_FIELD).toBe(alphabet)
      expect(row.SQL_WLONGVARCHAR_FIELD).toBe(alphabet)

      const buffer = Uint8Array.from(alphabet, (character) => character.codePointAt(0) ?? 0).buffer
      expect(row.SQL_LONGVARBINARY_FIELD).toEqual(buffer)

      expect(result.columns[0]).toEqual({
        name: 'SQL_LONGVARCHAR_FIELD',
        dataType: -1,
        dataTypeName: 'SQL_LONGVARCHAR',
        columnSize: 1048576,
        decimalDigits: 0,
        nullable: false,
      })
      expect(result.columns[1]).toEqual({
        name: 'SQL_WLONGVARCHAR_FIELD',
        dataType: -10,
        dataTypeName: 'SQL_WLONGVARCHAR',
        columnSize: 1048576,
        decimalDigits: 0,
        nullable: false,
      })
      expect(result.columns[2]).toEqual({
        name: 'SQL_LONGVARBINARY_FIELD',
        dataType: -4,
        dataTypeName: 'SQL_LONGVARBINARY',
        columnSize: 1048576,
        decimalDigits: 0,
        nullable: false,
      })

      await connection.close()
    },
  )
})
