import { describe, expect, it } from 'vitest'
import { pool, type Pool } from '../../lib/index.ts'
import { connectionString, waitFor } from '../helpers.ts'

const POOL_SIZE = 4

/**
 * A caller that takes one connection at a time, like a health probe, has to
 * reach every connection rather than the same one repeatedly. A connection the
 * pool never hands out is a connection nobody notices has died: on testlab a
 * flow idle for 350s is dropped, and neither end is told.
 */
describe('handing connections out', () => {
  it('rotates through every connection', async () => {
    const createdPool = await pool({ connectionString: connectionString(), initialSize: POOL_SIZE })
    await waitFor(() => createdPool.freeConnections.length === POOL_SIZE)

    const used = await useOneAtATime(createdPool, POOL_SIZE)

    expect(new Set(used).size).toBe(POOL_SIZE)
    await createdPool.close()
  })

  it('keeps rotating in the same order once every connection has been used', async () => {
    const createdPool = await pool({ connectionString: connectionString(), initialSize: POOL_SIZE })
    await waitFor(() => createdPool.freeConnections.length === POOL_SIZE)

    const firstRound = await useOneAtATime(createdPool, POOL_SIZE)
    const secondRound = await useOneAtATime(createdPool, POOL_SIZE)

    expect(secondRound).toEqual(firstRound)
    await createdPool.close()
  })
})

/** The connections a sequential caller is given, in the order it gets them. */
async function useOneAtATime(createdPool: Pool, count: number): Promise<unknown[]> {
  const used: unknown[] = []
  for (let index = 0; index < count; index++) {
    const connection = await createdPool.connect()
    used.push(connection)
    await connection.close()
  }
  return used
}
