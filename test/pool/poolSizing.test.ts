import { describe, expect, it } from 'vitest'
import { connectionsToCreate, connectionsToRelease } from '../../lib/poolSizing.ts'

describe('connectionsToCreate', () => {
  const base = { poolSize: 0, beingCreated: 0, waiting: 1, incrementSize: 10, maxSize: 100 }

  it('opens a whole increment when there is room', () => {
    expect(connectionsToCreate(base)).toBe(10)
  })

  it('opens nothing while enough connections are already on the way', () => {
    expect(connectionsToCreate({ ...base, beingCreated: 2, waiting: 1 })).toBe(0)
    expect(connectionsToCreate({ ...base, beingCreated: 1, waiting: 1 })).toBe(10)
  })

  it('opens nothing once the pool is at its maximum', () => {
    expect(connectionsToCreate({ ...base, poolSize: 100, maxSize: 100 })).toBe(0)
  })

  /**
   * The pool used to skip growing whenever a whole increment did not fit, so a
   * maxSize that was not a multiple of incrementSize was never reached and
   * callers waited on connections that were never opened.
   */
  it('opens only what is left when a whole increment does not fit', () => {
    expect(connectionsToCreate({ ...base, poolSize: 2, incrementSize: 10, maxSize: 5 })).toBe(3)
    expect(connectionsToCreate({ ...base, poolSize: 10, incrementSize: 10, maxSize: 15 })).toBe(5)
  })

  it('counts the connections already on the way against the maximum', () => {
    expect(connectionsToCreate({ ...base, poolSize: 8, beingCreated: 1, waiting: 4, maxSize: 10 })).toBe(
      1,
    )
  })

  it('never asks for a negative number of connections', () => {
    expect(connectionsToCreate({ ...base, poolSize: 20, maxSize: 10 })).toBe(0)
  })
})

describe('connectionsToRelease', () => {
  const now = 100_000
  const base = { now, poolSize: 4, minSize: 1, maxIdleMs: 40_000 }
  const idleFor = (...ages: number[]): number[] => ages.map((age) => now - age)

  it('releases nothing when every connection is fresh', () => {
    expect(connectionsToRelease({ ...base, idleSince: idleFor(1000, 2000, 3000) })).toBe(0)
  })

  it('releases the connections that have waited longer than the limit', () => {
    expect(connectionsToRelease({ ...base, idleSince: idleFor(90_000, 80_000, 1000) })).toBe(2)
  })

  /** The free list is ordered, so the first fresh connection ends the sweep. */
  it('stops at the first fresh connection', () => {
    expect(connectionsToRelease({ ...base, idleSince: idleFor(90_000, 1000, 80_000) })).toBe(1)
  })

  it('keeps the pool at its minimum size', () => {
    const idleSince = idleFor(90_000, 90_000, 90_000, 90_000)
    expect(connectionsToRelease({ ...base, idleSince, poolSize: 4, minSize: 3 })).toBe(1)
    expect(connectionsToRelease({ ...base, idleSince, poolSize: 4, minSize: 0 })).toBe(4)
  })

  it('releases nothing when the pool is already at its minimum', () => {
    expect(connectionsToRelease({ ...base, idleSince: idleFor(90_000), poolSize: 1, minSize: 1 })).toBe(
      0,
    )
  })

  it('counts connections handed out but not returned against the minimum', () => {
    expect(connectionsToRelease({ ...base, idleSince: idleFor(90_000), poolSize: 3, minSize: 1 })).toBe(
      1,
    )
  })

  it('treats the limit as exclusive, so a connection idle exactly that long stays', () => {
    expect(connectionsToRelease({ ...base, idleSince: idleFor(40_000) })).toBe(0)
    expect(connectionsToRelease({ ...base, idleSince: idleFor(40_001) })).toBe(1)
  })
})
