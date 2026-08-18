/**
 * Serialises connection opening across every pool in the process.
 *
 * Opening many at once is what the driver manager is least happy with, and one
 * at a time is the long-standing default. It is also why filling a pool costs
 * one round trip per connection; see docs/rustPort.md.
 */

const DEFAULT_MAX_ACTIVELY_CONNECTING = 1

const queued: (() => Promise<void>)[] = []
let activelyConnecting = 0
let maxActivelyConnecting = DEFAULT_MAX_ACTIVELY_CONNECTING

export function enqueueConnect(open: () => Promise<void>): void {
  queued.push(open)
  void drain()
}

export function setMaxActivelyConnecting(count: number): void {
  maxActivelyConnecting = count
}

async function drain(): Promise<void> {
  if (activelyConnecting >= maxActivelyConnecting) return

  const open = queued.shift()
  if (!open) return

  activelyConnecting++
  try {
    await open()
  } finally {
    activelyConnecting--
    void drain()
  }
}
