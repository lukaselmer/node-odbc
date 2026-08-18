import { describe, expect, it } from 'vitest'
import { pool } from '../../lib/index.ts'
import { connectionString, waitFor } from '../helpers.ts'

describe('.close()', () => {
  it('closes all connections in the pool', async () => {
    const createdPool = await pool(connectionString())
    await waitFor(() => createdPool.freeConnections.length === 10)

    await createdPool.close()
    expect(createdPool.freeConnections.length).toBe(0)
  })
})
