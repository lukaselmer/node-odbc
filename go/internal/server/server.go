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

// Lifetime says when the server stops on its own.
type Lifetime string

const (
	// UntilLastClient belongs to a server spawned by one Node process, which it
	// must never outlive.
	UntilLastClient Lifetime = "untilLastClient"
	// UntilSignal belongs to a server deployed on its own, next to callers that
	// come and go, such as a Kubernetes sidecar container.
	UntilSignal Lifetime = "untilSignal"
)

type Options struct {
	Network  string
	Address  string
	Lifetime Lifetime
}

// Server serves ODBC work to the clients that connect to it.
type Server struct {
	listener    net.Listener
	environment *odbc.Environment
	lifetime    Lifetime

	mutex    sync.Mutex
	sessions map[string]*session
	owners   map[string]*session
	nextID   atomic.Uint64

	clients atomic.Int64
	done    chan struct{}
}

func New(options Options) (*Server, error) {
	environment, err := odbc.NewEnvironment()
	if err != nil {
		return nil, err
	}

	listener, err := net.Listen(options.Network, options.Address)
	if err != nil {
		environment.Close()
		return nil, err
	}

	return &Server{
		listener:    listener,
		environment: environment,
		lifetime:    options.Lifetime,
		sessions:    map[string]*session{},
		owners:      map[string]*session{},
		done:        make(chan struct{}),
	}, nil
}

// Serve accepts clients until Close is called, or until the last client
// disconnects when the lifetime says so.
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

	client := newClient(connection)
	defer s.clientDisconnected(client)

	decoder := protocol.NewDecoder(connection)
	for {
		var request protocol.Request
		if err := decoder.Decode(&request); err != nil {
			if err != io.EOF {
				fmt.Fprintf(os.Stderr, "node-odbc: dropping client: %v\n", err)
			}
			return
		}
		s.dispatch(client, request)
	}
}

// A client that goes away takes its ODBC connections with it, so that a server
// outliving its callers cannot accumulate the connections they left behind.
func (s *Server) clientDisconnected(client *client) {
	for handle, session := range client.takeSessions() {
		s.discardSession(handle, session)
	}

	if s.clients.Add(-1) == 0 && s.lifetime == UntilLastClient {
		s.Close()
	}
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
	sessions := make(map[string]*session, len(s.sessions))
	for handle, session := range s.sessions {
		sessions[handle] = session
	}
	s.mutex.Unlock()

	for handle, session := range sessions {
		s.discardSession(handle, session)
	}
}

// discardSession closes a session and releases every handle it owned. The
// statements and cursors are read on the session goroutine, the only one
// allowed to touch them.
func (s *Server) discardSession(handle string, discarded *session) {
	var owned []string
	discarded.submit(func() {
		owned = ownedHandles(discarded)
		discarded.connection.Close()
	})
	discarded.stop()

	s.release(handle)
	for _, ownedHandle := range owned {
		s.release(ownedHandle)
	}
}

func ownedHandles(session *session) []string {
	handles := make([]string, 0, len(session.statements)+len(session.cursors))
	for handle := range session.statements {
		handles = append(handles, handle)
	}
	for handle := range session.cursors {
		handles = append(handles, handle)
	}
	return handles
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
