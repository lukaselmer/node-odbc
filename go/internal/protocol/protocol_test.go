package protocol

import (
	"bytes"
	"encoding/json"
	"strings"
	"testing"
)

func TestEncoderAndDecoderRoundTripFrames(t *testing.T) {
	var wire bytes.Buffer
	encoder := NewEncoder(&wire)

	sent := []Request{
		{ID: 1, Target: TargetODBC, Method: "connect"},
		{ID: 2, Target: TargetConnection, Handle: "c1", Method: "query"},
	}
	for _, request := range sent {
		if err := encoder.Encode(request); err != nil {
			t.Fatalf("encoding %d: %v", request.ID, err)
		}
	}

	decoder := NewDecoder(&wire)
	for _, expected := range sent {
		var decoded Request
		if err := decoder.Decode(&decoded); err != nil {
			t.Fatalf("decoding %d: %v", expected.ID, err)
		}
		if decoded.ID != expected.ID || decoded.Target != expected.Target ||
			decoded.Handle != expected.Handle || decoded.Method != expected.Method {
			t.Errorf("got %+v, want %+v", decoded, expected)
		}
	}
}

func TestDecoderRejectsOversizedFrame(t *testing.T) {
	oversized := []byte{0xff, 0xff, 0xff, 0xff}

	err := NewDecoder(bytes.NewReader(oversized)).Decode(&Request{})

	if err == nil || !strings.Contains(err.Error(), "exceeds") {
		t.Fatalf("got %v, want a frame size error", err)
	}
}

func TestBigIntSurvivesJSONAsAString(t *testing.T) {
	encoded, err := json.Marshal(BigInt(9007199254740993))
	if err != nil {
		t.Fatalf("marshalling: %v", err)
	}

	if string(encoded) != `{"$b":"9007199254740993"}` {
		t.Fatalf("got %s", encoded)
	}
}

func TestBinaryTravelsAsBase64(t *testing.T) {
	encoded, err := json.Marshal(Binary([]byte{0, 1, 255}))
	if err != nil {
		t.Fatalf("marshalling: %v", err)
	}

	if string(encoded) != `{"$d":"AAH/"}` {
		t.Fatalf("got %s", encoded)
	}
}

func TestDecodeValueRestoresTaggedValues(t *testing.T) {
	tests := map[string]struct {
		raw  any
		want any
	}{
		"big int":      {raw: map[string]any{"$b": "42"}, want: BigInt(42)},
		"binary":       {raw: map[string]any{"$d": "AAH/"}, want: Binary([]byte{0, 1, 255})},
		"plain string": {raw: "hello", want: "hello"},
		"plain number": {raw: float64(3.5), want: float64(3.5)},
		"null":         {raw: nil, want: nil},
	}

	for name, test := range tests {
		t.Run(name, func(t *testing.T) {
			got := DecodeValue(test.raw)

			if !equalValues(got, test.want) {
				t.Fatalf("got %#v, want %#v", got, test.want)
			}
		})
	}
}

func TestDecodeValueLeavesUnknownObjectsAlone(t *testing.T) {
	raw := map[string]any{"name": "column"}

	got := DecodeValue(raw)

	if _, isMap := got.(map[string]any); !isMap {
		t.Fatalf("got %#v, want the original map", got)
	}
}

func TestNewErrorAlwaysCarriesAnArray(t *testing.T) {
	err := NewError("[odbc] failed", nil)

	if err.OdbcErrors == nil {
		t.Fatal("odbcErrors must serialise as an array, not null")
	}
}

func equalValues(got, want any) bool {
	gotBinary, gotIsBinary := got.(Binary)
	wantBinary, wantIsBinary := want.(Binary)
	if gotIsBinary || wantIsBinary {
		return gotIsBinary && wantIsBinary && bytes.Equal(gotBinary, wantBinary)
	}
	return got == want
}
