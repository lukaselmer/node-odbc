package server

import (
	"fmt"
	"io"
	"net"
	"os"
	"sync"
	"sync/atomic"

	"github.com/lukaselmer/node-odbc/go/internal/odbc"
	"github.com/lukaselmer/node-odbc/go/internal/protocol"
)

// Server serves ODBC work over a unix socket. It exits once the last client
// disconnects so that it can never outlive the Node process that spawned it.
type Server struct {
	listener    net.Listener
	environment *odbc.Environment

	mutex    sync.Mutex
	sessions map[string]*session
	owners   map[string]*session
	nextID   atomic.Uint64

	clients atomic.Int64
	done    chan struct{}
}

func New(socketPath string) (*Server, error) {
	environment, err := odbc.NewEnvironment()
	if err != nil {
		return nil, err
	}

	listener, err := net.Listen("unix", socketPath)
	if err != nil {
		environment.Close()
		return nil, err
	}

	return &Server{
		listener:    listener,
		environment: environment,
		sessions:    map[string]*session{},
		owners:      map[string]*session{},
		done:        make(chan struct{}),
	}, nil
}

// Serve accepts clients until the last one disconnects or Close is called.
func (s *Server) Serve() error {
	go s.acceptLoop()
	<-s.done
	return nil
}

func (s *Server) acceptLoop() {
	for {
		connection, err := s.listener.Accept()
		if err != nil {
			return
		}
		s.clients.Add(1)
		go s.serveClient(connection)
	}
}

func (s *Server) serveClient(connection net.Conn) {
	defer connection.Close()
	defer s.clientDisconnected()

	decoder := protocol.NewDecoder(connection)
	encoder := protocol.NewEncoder(connection)

	for {
		var request protocol.Request
		if err := decoder.Decode(&request); err != nil {
			if err != io.EOF {
				fmt.Fprintf(os.Stderr, "node-odbc: dropping client: %v\n", err)
			}
			return
		}
		s.dispatch(request, encoder)
	}
}

func (s *Server) clientDisconnected() {
	if s.clients.Add(-1) > 0 {
		return
	}
	s.Close()
}

func (s *Server) Close() {
	select {
	case <-s.done:
		return
	default:
	}

	s.listener.Close()
	s.closeSessions()
	s.environment.Close()
	close(s.done)
}

func (s *Server) closeSessions() {
	s.mutex.Lock()
	sessions := make([]*session, 0, len(s.sessions))
	for _, session := range s.sessions {
		sessions = append(sessions, session)
	}
	s.sessions = map[string]*session{}
	s.owners = map[string]*session{}
	s.mutex.Unlock()

	for _, session := range sessions {
		session.submit(func() { session.connection.Close() })
		session.stop()
	}
}

func (s *Server) newHandle(prefix string) string {
	return fmt.Sprintf("%s%d", prefix, s.nextID.Add(1))
}

func (s *Server) registerSession(handle string, session *session) {
	s.mutex.Lock()
	defer s.mutex.Unlock()
	s.sessions[handle] = session
	s.owners[handle] = session
}

// registerOwner records which session a statement or cursor belongs to, so
// that its work runs on the same goroutine as its connection.
func (s *Server) registerOwner(handle string, session *session) {
	s.mutex.Lock()
	defer s.mutex.Unlock()
	s.owners[handle] = session
}

func (s *Server) release(handle string) {
	s.mutex.Lock()
	defer s.mutex.Unlock()
	delete(s.sessions, handle)
	delete(s.owners, handle)
}

func (s *Server) sessionOf(handle string) *session {
	s.mutex.Lock()
	defer s.mutex.Unlock()
	return s.owners[handle]
}

func (s *Server) removeSession(handle string) *session {
	s.mutex.Lock()
	defer s.mutex.Unlock()
	session := s.sessions[handle]
	delete(s.sessions, handle)
	delete(s.owners, handle)
	return session
}
