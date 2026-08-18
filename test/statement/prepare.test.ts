import { describe, expect, it } from 'vitest'
import { connect } from '../../lib/index.ts'
import { connectionString, qualifiedTable } from '../helpers.ts'

type LoosePrepare = (...args: unknown[]) => Promise<void>

describe('.prepare(sql)', () => {
  it('throws a TypeError when called with an invalid signature', async () => {
    const connection = await connect(connectionString())
    const statement = await connection.createStatement()
    const invalidPrepare = statement.prepare.bind(statement) as unknown as LoosePrepare
    const message = '[node-odbc]: statement.prepare requires the SQL to be a string.'

    await expect(invalidPrepare()).rejects.toThrow(message)
    await expect(invalidPrepare(1)).rejects.toThrow(message)
    await expect(invalidPrepare(null)).rejects.toThrow(message)
    await expect(invalidPrepare(undefined)).rejects.toThrow(message)
    await expect(invalidPrepare({})).rejects.toThrow(message)

    await connection.close()
  })

  it('prepares a valid SQL string', async () => {
    const connection = await connect(connectionString())
    const statement = await connection.createStatement()
    await expect(
      statement.prepare(`INSERT INTO ${qualifiedTable()} VALUES(?, ?, ?)`),
    ).resolves.not.toThrow()
    await connection.close()
  })

  it.skipIf(process.env.DBMS === 'mssql' || process.env.DBMS === 'postgres')(
    // SQL Server and PostgreSQL don't check for syntax errors when the application calls SQLPrepare
    'rejects an invalid SQL string',
    async () => {
      const connection = await connect(connectionString())
      const statement = await connection.createStatement()
      await expect(statement.prepare('INSERT INTO dummy123.table456 VALUES()')).rejects.toThrow()
      await connection.close()
    },
  )

  it.skipIf(process.env.DBMS === 'mssql' || process.env.DBMS === 'postgres')(
    // SQL Server and PostgreSQL don't check for syntax errors when the application calls SQLPrepare
    'rejects a blank SQL string',
    async () => {
      const connection = await connect(connectionString())
      const statement = await connection.createStatement()
      await expect(statement.prepare('')).rejects.toThrow()
      await connection.close()
    },
  )
})
