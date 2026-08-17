package odbc

import (
	"unsafe"

	"github.com/alexbrainman/odbc/api"
	"github.com/lukaselmer/node-odbc/go/internal/odbcapi"
)

// longDataReader assembles a value that does not fit a bound buffer by calling
// SQLGetData until the driver stops reporting more data. The buffer has to be
// C memory because the driver writes into it.
type longDataReader struct {
	statement *statement
	column    int
	bindType  int16
	buffer    unsafe.Pointer
	capacity  int
	size      int
	isNull    bool
}

func newLongDataReader(statement *statement, column int, bindType int16) *longDataReader {
	capacity := statement.initialBufferSize()
	return &longDataReader{
		statement: statement,
		column:    column,
		bindType:  bindType,
		buffer:    odbcapi.Alloc(capacity),
		capacity:  capacity,
	}
}

func (r *longDataReader) read() error {
	indicator, err := r.getData(r.buffer, r.capacity)
	if err != nil {
		return err
	}

	switch {
	case indicator == odbcapi.SQLNullData:
		r.isNull = true
		return nil
	case indicator == odbcapi.SQLNoTotal || int(indicator) >= r.capacity:
		return r.readRemaining(indicator)
	default:
		r.size = int(indicator)
		return nil
	}
}

// readRemaining grows the buffer and keeps reading. The driver either tells us
// how much is left, or says SQL_NO_TOTAL and we double until it fits.
func (r *longDataReader) readRemaining(indicator api.SQLLEN) error {
	for {
		r.growFor(indicator)

		freeSpace := r.capacity - r.size
		next, err := r.getData(unsafe.Add(r.buffer, r.size), freeSpace)
		if err != nil {
			return err
		}
		if next == noMoreData {
			return nil
		}

		if r.completes(next, freeSpace) {
			r.size += int(next)
			return nil
		}
		indicator = next
	}
}

// growFor accounts for the bytes the last call wrote and resizes the buffer for
// what is still outstanding.
func (r *longDataReader) growFor(indicator api.SQLLEN) {
	written := r.writtenLength(indicator)

	if indicator == odbcapi.SQLNoTotal {
		r.capacity *= 2
	} else {
		r.capacity = r.size + r.outstandingCapacity(indicator)
	}

	r.buffer = odbcapi.Realloc(r.buffer, r.capacity)
	r.size += written
}

// writtenLength is how much of the previous chunk landed in the buffer, which
// the driver only reports indirectly for the string types.
func (r *longDataReader) writtenLength(indicator api.SQLLEN) int {
	switch r.bindType {
	case odbcapi.SQLCBinary:
		if r.size+int(indicator) <= r.capacity {
			return int(indicator)
		}
		return r.capacity - r.size
	case odbcapi.SQLCWchar:
		return utf16Length(unsafe.Add(r.buffer, r.size), r.capacity-r.size) * sqlWcharSize
	default:
		return byteLength(unsafe.Add(r.buffer, r.size), r.capacity-r.size)
	}
}

// outstandingCapacity leaves room for the terminator the driver insists on
// writing, and for UTF-8 expansion when the driver counts characters.
func (r *longDataReader) outstandingCapacity(indicator api.SQLLEN) int {
	switch r.bindType {
	case odbcapi.SQLCBinary:
		return int(indicator)
	case odbcapi.SQLCWchar:
		return int(indicator) + sqlWcharSize
	default:
		return int(indicator)*maxUtf8Bytes + 1
	}
}

// completes reports whether the chunk the driver just wrote was the last one,
// which it signals by returning a length that fits with the terminator.
func (r *longDataReader) completes(indicator api.SQLLEN, freeSpace int) bool {
	if indicator == odbcapi.SQLNoTotal {
		return false
	}
	switch r.bindType {
	case odbcapi.SQLCBinary:
		return int(indicator) <= freeSpace
	case odbcapi.SQLCWchar:
		return int(indicator) <= freeSpace-sqlWcharSize
	default:
		return int(indicator) <= freeSpace-1
	}
}

const noMoreData api.SQLLEN = -100

func (r *longDataReader) getData(target unsafe.Pointer, length int) (api.SQLLEN, error) {
	var indicator api.SQLLEN
	ret := api.SQLGetData(
		r.statement.handle,
		api.SQLUSMALLINT(r.column+1),
		api.SQLSMALLINT(r.bindType),
		api.SQLPOINTER(target),
		api.SQLLEN(length),
		&indicator,
	)
	if ret == odbcapi.SQLNoData {
		return noMoreData, nil
	}
	if !odbcapi.Succeeded(int16(ret)) {
		return 0, r.statement.newError("[odbc] Error fetching long data with SQLGetData")
	}
	return indicator, nil
}

func (r *longDataReader) bytes() []byte {
	return copyBytes(r.buffer, r.size)
}

func (r *longDataReader) free() {
	if r.buffer != nil {
		odbcapi.Free(r.buffer)
		r.buffer = nil
	}
}

func byteLength(buffer unsafe.Pointer, limit int) int {
	if limit <= 0 {
		return 0
	}
	bytes := unsafe.Slice((*byte)(buffer), limit)
	for index, character := range bytes {
		if character == 0 {
			return index
		}
	}
	return limit
}

func utf16Length(buffer unsafe.Pointer, limit int) int {
	units := limit / sqlWcharSize
	if units <= 0 {
		return 0
	}
	values := unsafe.Slice((*uint16)(buffer), units)
	for index, unit := range values {
		if unit == 0 {
			return index
		}
	}
	return units
}
