package server

import (
	"net"
	"sync"

	"github.com/lukaselmer/node-odbc/go/internal/protocol"
)

// client is one connected caller, holding the sessions it opened so that they
// can be closed when it disconnects.
type client struct {
	encoder *protocol.Encoder

	mutex    sync.Mutex
	sessions map[string]*session
}

func newClient(connection net.Conn) *client {
	return &client{
		encoder:  protocol.NewEncoder(connection),
		sessions: map[string]*session{},
	}
}

func (c *client) track(handle string, session *session) {
	c.mutex.Lock()
	defer c.mutex.Unlock()
	c.sessions[handle] = session
}

func (c *client) forget(handle string) {
	c.mutex.Lock()
	defer c.mutex.Unlock()
	delete(c.sessions, handle)
}

func (c *client) takeSessions() map[string]*session {
	c.mutex.Lock()
	defer c.mutex.Unlock()
	sessions := c.sessions
	c.sessions = map[string]*session{}
	return sessions
}
