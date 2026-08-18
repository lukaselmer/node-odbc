package server

import (
	"runtime"

	"github.com/lukaselmer/node-odbc/go/internal/odbc"
)

// session owns one ODBC connection and everything opened on it. All of its
// work runs on a single goroutine pinned to one OS thread: ODBC handles are
// not meant to be driven from several threads at once, and some drivers keep
// thread-local state.
type session struct {
	connection *odbc.Connection
	work       chan func()
	closed     chan struct{}
	statements map[string]*odbc.Statement
	cursors    map[string]*odbc.Cursor
}

func newSession(connection *odbc.Connection) *session {
	session := &session{
		connection: connection,
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
// has already shut down reports it rather than blocking forever.
func (s *session) submit(job func()) bool {
	done := make(chan struct{})
	wrapped := func() {
		defer close(done)
		job()
	}

	select {
	case s.work <- wrapped:
		<-done
		return true
	case <-s.closed:
		return false
	}
}

func (s *session) stop() {
	close(s.work)
	<-s.closed
}
