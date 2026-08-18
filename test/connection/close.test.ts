import { describe, expect, it } from 'vitest'
import { connect } from '../../lib/index.ts'
import { connectionString, qualifiedTable } from '../helpers.ts'

describe('.close()', () => {
  it('sets the connected property to false', async () => {
    const connection = await connect(connectionString())
    expect(connection.connected).toBe(true)
    await connection.close()
    expect(connection.connected).toBe(false)
  })

  it('rejects queries made after close', async () => {
    const connection = await connect(connectionString())
    await connection.close()
    await expect(connection.query(`SELECT * FROM ${qualifiedTable()}`)).rejects.toThrow()
  })
})
