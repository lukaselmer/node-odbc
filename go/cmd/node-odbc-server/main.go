// Command node-odbc-server exposes unixODBC over a unix socket for the
// node-odbc JavaScript client.
package main

import (
	"flag"
	"fmt"
	"os"
	"os/signal"
	"syscall"

	"github.com/lukaselmer/node-odbc/go/internal/server"
)

func main() {
	socketPath := flag.String("socket", "", "path of the unix socket to listen on")
	flag.Parse()

	if *socketPath == "" {
		fmt.Fprintln(os.Stderr, "node-odbc: --socket is required")
		os.Exit(2)
	}

	if err := run(*socketPath); err != nil {
		fmt.Fprintf(os.Stderr, "node-odbc: %v\n", err)
		os.Exit(1)
	}
}

func run(socketPath string) error {
	odbcServer, err := server.New(socketPath)
	if err != nil {
		return err
	}
	defer os.Remove(socketPath)

	go shutdownOnSignal(odbcServer)

	// The client waits for this line before connecting.
	fmt.Println("ready")
	os.Stdout.Sync()

	return odbcServer.Serve()
}

func shutdownOnSignal(odbcServer *server.Server) {
	signals := make(chan os.Signal, 1)
	signal.Notify(signals, syscall.SIGINT, syscall.SIGTERM)
	<-signals
	odbcServer.Close()
}
