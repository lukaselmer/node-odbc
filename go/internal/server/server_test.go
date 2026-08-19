package server

import (
	"net"
	"testing"
	"time"

	"github.com/lukaselmer/node-odbc/go/internal/protocol"
)

func TestExitsWithItsLastClient(t *testing.T) {
	server := start(t, UntilLastClient)

	client := dial(t, server)
	client.Close()

	if !stopped(server) {
		t.Fatal("the server kept running after its last client disconnected")
	}
}

func TestOutlivesItsClients(t *testing.T) {
	server := start(t, UntilSignal)
	defer server.Close()

	first := dial(t, server)
	first.Close()

	second := dial(t, server)
	defer second.Close()

	if message := errorOf(t, ask(t, second)); message != "[odbc] The handle c1 is no longer valid" {
		t.Fatalf("the server stopped answering after a client left: %q", message)
	}
}

func start(t *testing.T, lifetime Lifetime) *Server {
	t.Helper()

	server, err := New(Options{Network: "tcp", Address: "127.0.0.1:0", Lifetime: lifetime})
	if err != nil {
		t.Fatalf("starting the server: %v", err)
	}
	go server.Serve()
	return server
}

func dial(t *testing.T, server *Server) net.Conn {
	t.Helper()

	connection, err := net.Dial("tcp", server.listener.Addr().String())
	if err != nil {
		t.Fatalf("connecting to the server: %v", err)
	}
	return connection
}

// ask sends a request for a handle that was never opened, which every running
// server answers without needing a database.
func ask(t *testing.T, connection net.Conn) protocol.Response {
	t.Helper()

	request := protocol.Request{ID: 1, Target: protocol.TargetConnection, Handle: "c1", Method: "close"}
	if err := protocol.NewEncoder(connection).Encode(request); err != nil {
		t.Fatalf("sending the request: %v", err)
	}

	var response protocol.Response
	connection.SetReadDeadline(time.Now().Add(5 * time.Second))
	if err := protocol.NewDecoder(connection).Decode(&response); err != nil {
		t.Fatalf("reading the response: %v", err)
	}
	return response
}

func errorOf(t *testing.T, response protocol.Response) string {
	t.Helper()

	if response.Error == nil {
		t.Fatal("expected an error response")
	}
	return response.Error.Message
}

func stopped(server *Server) bool {
	select {
	case <-server.done:
		return true
	case <-time.After(5 * time.Second):
		return false
	}
}
