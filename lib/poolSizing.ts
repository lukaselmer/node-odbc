/**
 * How many connections the pool should open or close.
 *
 * Kept apart from the pool itself because these are the decisions worth testing
 * exhaustively, and doing that through a pool means opening real connections.
 */

/** How many connections to open for a caller that found none free. */
export function connectionsToCreate(props: {
  poolSize: number
  beingCreated: number
  waiting: number
  incrementSize: number
  maxSize: number
}): number {
  const { poolSize, beingCreated, waiting, incrementSize, maxSize } = props
  if (beingCreated > waiting) return 0

  const room = maxSize - poolSize - beingCreated
  return Math.max(Math.min(incrementSize, room), 0)
}

/**
 * How many connections to close, taken from the front of the free list.
 *
 * The front is the one that has waited longest, because a connection is taken
 * from the front and returned to the back. Counting stops at the first
 * connection that is still fresh, since everything behind it is fresher.
 */
export function connectionsToRelease(props: {
  idleSince: readonly number[]
  now: number
  poolSize: number
  minSize: number
  maxIdleMs: number
}): number {
  const { idleSince, now, poolSize, minSize, maxIdleMs } = props

  let count = 0
  while (count < idleSince.length && poolSize - count > minSize) {
    const since = idleSince[count]
    if (since === undefined || now - since <= maxIdleMs) break
    count++
  }
  return count
}
