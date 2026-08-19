import { describe, expect, it } from 'vitest'
import { pool } from '../../lib/index.ts'
import { connectionString, waitFor } from '../helpers.ts'

const POOL_SIZE = 4
const SHRINK_INTERVAL_MS = 300

/** Long enough for every connection to finish opening and several sweeps to run. */
const SETTLE_MS = 8000

describe('shrinking', () => {
  it('closes the connections nobody has used', async () => {
    const createdPool = await pool({
      connectionString: connectionString(),
      initialSize: POOL_SIZE,
      minSize: 1,
      shrinkIntervalMs: SHRINK_INTERVAL_MS,
    })

    await settle()

    expect(createdPool.poolSize).toBe(1)
    expect(createdPool.freeConnections.length).toBe(1)
    await createdPool.close()
  })

  it('never shrinks below the minimum size', async () => {
    const createdPool = await pool({
      connectionString: connectionString(),
      initialSize: POOL_SIZE,
      minSize: 3,
      shrinkIntervalMs: SHRINK_INTERVAL_MS,
    })

    await settle()

    expect(createdPool.poolSize).toBe(3)
    await createdPool.close()
  })

  it('leaves the pool alone when shrinking is off', async () => {
    const createdPool = await pool({
      connectionString: connectionString(),
      initialSize: POOL_SIZE,
      shrink: false,
      shrinkIntervalMs: SHRINK_INTERVAL_MS,
    })
    await waitFor(() => createdPool.freeConnections.length === POOL_SIZE)

    await settle()

    expect(createdPool.poolSize).toBe(POOL_SIZE)
    await createdPool.close()
  })

  it('keeps a connection that is checked out', async () => {
    const createdPool = await pool({
      connectionString: connectionString(),
      initialSize: POOL_SIZE,
      minSize: 1,
      shrinkIntervalMs: SHRINK_INTERVAL_MS,
    })
    const busy = await createdPool.connect()

    await settle()

    await expect(busy.query('SELECT 1')).resolves.toBeDefined()
    await busy.close()
    await createdPool.close()
  })

  it('opens connections again after shrinking', async () => {
    const createdPool = await pool({
      connectionString: connectionString(),
      initialSize: POOL_SIZE,
      minSize: 1,
      shrinkIntervalMs: SHRINK_INTERVAL_MS,
    })
    await settle()

    const revived = await Promise.all([createdPool.query('SELECT 1'), createdPool.query('SELECT 1')])

    expect(revived).toHaveLength(2)
    await createdPool.close()
  })
})

async function settle(): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, SETTLE_MS)
  })
}
