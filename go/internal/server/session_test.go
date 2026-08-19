package server

import "testing"

// A client that disconnects and a connection that closes itself race for the
// same session, so both paths end up stopping it.
func TestStoppingTwice(t *testing.T) {
	session := newSession(nil, nil)

	session.stop()
	session.stop()

	if session.submit(func() {}) {
		t.Fatal("a stopped session accepted work")
	}
}

func TestRunsWorkOnOneGoroutine(t *testing.T) {
	session := newSession(nil, nil)
	defer session.stop()

	done := false
	if !session.submit(func() { done = true }) {
		t.Fatal("a running session refused work")
	}
	if !done {
		t.Fatal("submit returned before the job had run")
	}
}
