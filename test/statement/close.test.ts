import { describe, expect, it } from 'vitest'
import { connect } from '../../lib/index.ts'
import { connectionString, qualifiedTable } from '../helpers.ts'

describe('.close()', () => {
  it('closes a newly created statement', async () => {
    const connection = await connect(connectionString())
    const statement = await connection.createStatement()
    await statement.close()
    await connection.close()
  })

  it('closes after preparing a statement with parameters', async () => {
    const connection = await connect(connectionString())
    const statement = await connection.createStatement()
    await statement.prepare(`INSERT INTO ${qualifiedTable()} VALUES(?, ?, ?)`)
    await statement.close()
    await connection.close()
  })

  it('closes after preparing a statement without parameters', async () => {
    const connection = await connect(connectionString())
    const statement = await connection.createStatement()
    await statement.prepare(`INSERT INTO ${qualifiedTable()} VALUES(1, 'bound', 10)`)
    await statement.close()
    await connection.close()
  })

  it('closes after preparing and binding a statement', async () => {
    const connection = await connect(connectionString())
    const statement = await connection.createStatement()
    await statement.prepare(`INSERT INTO ${qualifiedTable()} VALUES(?, ?, ?)`)
    await statement.bind([1, 'bound', 10])
    await statement.close()
    await connection.close()
  })

  it('closes after preparing, binding, and executing successfully', async () => {
    const connection = await connect(connectionString())
    const statement = await connection.createStatement()
    await statement.prepare(`INSERT INTO ${qualifiedTable()} VALUES(?, ?, ?)`)
    await statement.bind([1, 'bound', 10])
    const result = await statement.execute()
    expect(result).not.toBeNull()
    await statement.close()
    await connection.close()
  })

  it.skipIf(process.env.DBMS === 'mssql' || process.env.DBMS === 'postgres')(
    // SQL Server and PostgreSQL don't check for syntax errors when the application calls SQLPrepare
    'closes after prepare fails on a bad SQL string',
    async () => {
      const connection = await connect(connectionString())
      const statement = await connection.createStatement()
      await expect(statement.prepare('abc123!@#')).rejects.toThrow()
      await statement.close()
      await connection.close()
    },
  )

  it('closes after execute fails because parameters were not bound', async () => {
    const connection = await connect(connectionString())
    const statement = await connection.createStatement()
    await statement.prepare(`INSERT INTO ${qualifiedTable()} VALUES(?, ?, ?)`)
    await expect(statement.execute()).rejects.toThrow()
    await statement.close()
    await connection.close()
  })

  it('rejects preparing after the statement has been closed', async () => {
    const connection = await connect(connectionString())
    const statement = await connection.createStatement()
    await statement.close()
    await expect(statement.prepare(`INSERT INTO ${qualifiedTable()} VALUES(?, ?, ?)`)).rejects.toThrow()
    await connection.close()
  })

  it('rejects binding after the statement has been closed', async () => {
    const connection = await connect(connectionString())
    const statement = await connection.createStatement()
    await statement.prepare(`INSERT INTO ${qualifiedTable()} VALUES(?, ?, ?)`)
    await statement.close()
    await expect(statement.bind([1, 'bound', 10])).rejects.toThrow()
    await connection.close()
  })

  it('rejects executing after the statement has been closed', async () => {
    const connection = await connect(connectionString())
    const statement = await connection.createStatement()
    await statement.prepare(`INSERT INTO ${qualifiedTable()} VALUES(?, ?, ?)`)
    await statement.bind([1, 'bound', 10])
    await statement.close()
    await expect(statement.execute()).rejects.toThrow()
    await connection.close()
  })
})
