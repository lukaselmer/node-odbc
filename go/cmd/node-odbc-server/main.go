// Command node-odbc-server exposes unixODBC to the node-odbc JavaScript
// client, either over a unix socket next to it or over a TCP port, which is
// what lets it run in a container of its own.
package main

import (
	"errors"
	"flag"
	"fmt"
	"os"
	"os/signal"
	"syscall"

	"github.com/lukaselmer/node-odbc/go/internal/server"
)

func main() {
	socketPath := flag.String("socket", "", "unix socket to listen on; exits once the last client disconnects")
	listenAddress := flag.String("listen", "", "TCP address to listen on, such as 127.0.0.1:9711; runs until it is signalled")
	flag.Parse()

	options, err := optionsFrom(*socketPath, *listenAddress)
	if err != nil {
		fmt.Fprintf(os.Stderr, "node-odbc: %v\n", err)
		os.Exit(2)
	}

	if err := run(options); err != nil {
		fmt.Fprintf(os.Stderr, "node-odbc: %v\n", err)
		os.Exit(1)
	}
}

func optionsFrom(socketPath string, listenAddress string) (server.Options, error) {
	switch {
	case socketPath != "" && listenAddress != "":
		return server.Options{}, errors.New("--socket and --listen cannot be combined")
	case socketPath != "":
		return server.Options{Network: "unix", Address: socketPath, Lifetime: server.UntilLastClient}, nil
	case listenAddress != "":
		return server.Options{Network: "tcp", Address: listenAddress, Lifetime: server.UntilSignal}, nil
	default:
		return server.Options{}, errors.New("either --socket or --listen is required")
	}
}

func run(options server.Options) error {
	odbcServer, err := server.New(options)
	if err != nil {
		return err
	}

	go shutdownOnSignal(odbcServer)

	// A spawning client waits for this line before connecting.
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
