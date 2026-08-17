package protocol

import (
	"bufio"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"io"
	"sync"
)

// Frames are a 4-byte big-endian length followed by that many bytes of JSON.
const maxFrameSize = 512 << 20

type Decoder struct {
	reader *bufio.Reader
}

func NewDecoder(reader io.Reader) *Decoder {
	return &Decoder{reader: bufio.NewReaderSize(reader, 64<<10)}
}

func (d *Decoder) Decode(message any) error {
	payload, err := d.readFrame()
	if err != nil {
		return err
	}
	return json.Unmarshal(payload, message)
}

func (d *Decoder) readFrame() ([]byte, error) {
	var header [4]byte
	if _, err := io.ReadFull(d.reader, header[:]); err != nil {
		return nil, err
	}
	size := binary.BigEndian.Uint32(header[:])
	if size > maxFrameSize {
		return nil, fmt.Errorf("frame of %d bytes exceeds the %d byte limit", size, maxFrameSize)
	}
	payload := make([]byte, size)
	if _, err := io.ReadFull(d.reader, payload); err != nil {
		return nil, err
	}
	return payload, nil
}

// Encoder serialises writes so that frames from concurrent goroutines cannot
// interleave.
type Encoder struct {
	mutex  sync.Mutex
	writer *bufio.Writer
}

func NewEncoder(writer io.Writer) *Encoder {
	return &Encoder{writer: bufio.NewWriterSize(writer, 64<<10)}
}

func (e *Encoder) Encode(message any) error {
	payload, err := json.Marshal(message)
	if err != nil {
		return err
	}

	e.mutex.Lock()
	defer e.mutex.Unlock()

	if err := e.writeFrame(payload); err != nil {
		return err
	}
	return e.writer.Flush()
}

func (e *Encoder) writeFrame(payload []byte) error {
	var header [4]byte
	binary.BigEndian.PutUint32(header[:], uint32(len(payload)))
	if _, err := e.writer.Write(header[:]); err != nil {
		return err
	}
	_, err := e.writer.Write(payload)
	return err
}
