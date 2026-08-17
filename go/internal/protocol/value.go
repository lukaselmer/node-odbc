package protocol

import (
	"encoding/base64"
	"encoding/json"
	"strconv"
)

// JSON cannot represent the two value kinds the addon handed to JavaScript as
// BigInt and ArrayBuffer, so both travel tagged and the client untags them.
const (
	bigIntTag = "$b"
	binaryTag = "$d"
)

// BigInt marshals to a tagged object the client turns into a JavaScript BigInt.
type BigInt int64

func (b BigInt) MarshalJSON() ([]byte, error) {
	return json.Marshal(map[string]string{bigIntTag: strconv.FormatInt(int64(b), 10)})
}

// Binary marshals to a tagged object the client turns into an ArrayBuffer.
type Binary []byte

func (b Binary) MarshalJSON() ([]byte, error) {
	return json.Marshal(map[string]string{binaryTag: base64.StdEncoding.EncodeToString(b)})
}

// DecodeValue converts a decoded JSON value coming from the client back into
// the Go representation the ODBC layer binds parameters from.
func DecodeValue(raw any) any {
	tagged, ok := raw.(map[string]any)
	if !ok {
		return raw
	}
	if text, ok := tagged[bigIntTag].(string); ok {
		return decodeBigInt(text)
	}
	if text, ok := tagged[binaryTag].(string); ok {
		return decodeBinary(text)
	}
	return raw
}

func decodeBigInt(text string) any {
	value, err := strconv.ParseInt(text, 10, 64)
	if err != nil {
		return text
	}
	return BigInt(value)
}

func decodeBinary(text string) any {
	value, err := base64.StdEncoding.DecodeString(text)
	if err != nil {
		return text
	}
	return Binary(value)
}
