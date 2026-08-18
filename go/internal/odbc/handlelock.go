package odbc

import "sync"

// Handle allocation, connecting and disconnecting are serialised process-wide.
//
// Drivers are allowed to be thread-safe only per handle, and several of them
// (the PostgreSQL one included) crash when two threads set up or tear down
// connections on the same environment at once. Statement execution and
// fetching stay outside this lock: those run concurrently on their own
// connections, which is where the parallelism actually matters.
var handleMutex sync.Mutex
