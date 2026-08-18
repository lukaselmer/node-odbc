import { describe, expect, it } from 'vitest'
import { Connection, connect } from '../../lib/index.ts'
import { connectionString } from '../helpers.ts'

describe('odbc.connect', () => {
  it('returns an open connection for a valid connection string', async () => {
    const connection = await connect(connectionString())
    expect(connection).toBeInstanceOf(Connection)
    expect(connection.connected).toBe(true)
    await connection.close()
  })

  it('rejects an invalid connection string', async () => {
    await expect(connect('abc123!@#')).rejects.toThrow()
  })

  it('rejects with the driver diagnostics attached', async () => {
    await expect(connect('abc123!@#')).rejects.toMatchObject({
      odbcErrors: expect.arrayContaining([
        expect.objectContaining({ state: expect.any(String), message: expect.any(String) }),
      ]),
    })
  })
})
