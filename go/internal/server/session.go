package server

import (
	"runtime"
	"sync"

	"github.com/lukaselmer/node-odbc/go/internal/odbc"
)

// session owns one ODBC connection and everything opened on it. All of its
// work runs on a single goroutine pinned to one OS thread: ODBC handles are
// not meant to be driven from several threads at once, and some drivers keep
// thread-local state.
type session struct {
	connection *odbc.Connection
	owner      *client
	work       chan func()
	closed     chan struct{}
	statements map[string]*odbc.Statement
	cursors    map[string]*odbc.Cursor

	// Held for reading while a job is handed over, and for writing while the
	// queue is closed, so that the two cannot overlap.
	mutex   sync.RWMutex
	stopped bool
}

func newSession(connection *odbc.Connection, owner *client) *session {
	session := &session{
		connection: connection,
		owner:      owner,
		work:       make(chan func()),
		closed:     make(chan struct{}),
		statements: map[string]*odbc.Statement{},
		cursors:    map[string]*odbc.Cursor{},
	}
	go session.run()
	return session
}

func (s *session) run() {
	runtime.LockOSThread()
	defer runtime.UnlockOSThread()

	for job := range s.work {
		job()
	}
	close(s.closed)
}

// submit runs a job on the session goroutine and waits for it. A session that
// has already been stopped reports it rather than waiting for a goroutine that
// is never going to run it.
func (s *session) submit(job func()) bool {
	done := make(chan struct{})
	wrapped := func() {
		defer close(done)
		job()
	}

	s.mutex.RLock()
	if s.stopped {
		s.mutex.RUnlock()
		return false
	}
	s.work <- wrapped
	s.mutex.RUnlock()

	<-done
	return true
}

// stop ends the session goroutine, and may be called more than once: a client
// that disconnects and a connection that closes itself race for the same
// session.
func (s *session) stop() {
	s.mutex.Lock()
	wasRunning := !s.stopped
	s.stopped = true
	if wasRunning {
		close(s.work)
	}
	s.mutex.Unlock()

	<-s.closed
}
