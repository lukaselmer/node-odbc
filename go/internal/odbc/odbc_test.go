package odbc

import (
	"testing"

	"github.com/lukaselmer/node-odbc/go/internal/odbcapi"
)

func TestDataTypeNameSpellsTheOdbcMacro(t *testing.T) {
	tests := map[int16]string{
		odbcapi.SQLVarchar:       "SQL_VARCHAR",
		odbcapi.SQLBigint:        "SQL_BIGINT",
		odbcapi.SQLTypeTimestamp: "SQL_TYPE_TIMESTAMP",
		odbcapi.SQLGuid:          "SQL_GUID",
		12345:                    "UNKNOWN",
	}

	for dataType, want := range tests {
		if got := dataTypeName(dataType); got != want {
			t.Errorf("dataTypeName(%d) = %q, want %q", dataType, got, want)
		}
	}
}

func TestCorrectedColumnSizeRaisesUnusableDateAndTimeSizes(t *testing.T) {
	tests := []struct {
		name       string
		dataType   int16
		columnSize uint64
		want       uint64
	}{
		{name: "date size reported as zero", dataType: odbcapi.SQLTypeDate, columnSize: 0, want: 10},
		{name: "date size already usable", dataType: odbcapi.SQLTypeDate, columnSize: 24, want: 24},
		{name: "time size reported as zero", dataType: odbcapi.SQLTypeTime, columnSize: 0, want: 8},
		{name: "other types are untouched", dataType: odbcapi.SQLVarchar, columnSize: 0, want: 0},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if got := correctedColumnSize(test.dataType, test.columnSize); got != test.want {
				t.Fatalf("got %d, want %d", got, test.want)
			}
		})
	}
}

func TestParseFloatFallsBackToZeroLikeAtof(t *testing.T) {
	tests := map[string]float64{
		"3.5":          3.5,
		"  -2  ":       -2,
		"":             0,
		"not a number": 0,
	}

	for text, want := range tests {
		if got := parseFloat(text); got != want {
			t.Errorf("parseFloat(%q) = %v, want %v", text, got, want)
		}
	}
}

func TestDecodeUtf16ReadsLittleEndianUnits(t *testing.T) {
	data := []byte{'h', 0, 'i', 0}

	if got := decodeUtf16(data); got != "hi" {
		t.Fatalf("got %q, want %q", got, "hi")
	}
}

func TestDecodeUtf16DecodesSurrogatePairs(t *testing.T) {
	// U+1F600, encoded as the surrogate pair D83D DE00.
	data := []byte{0x3d, 0xd8, 0x00, 0xde}

	if got := decodeUtf16(data); got != "\U0001F600" {
		t.Fatalf("got %q, want an emoji", got)
	}
}

func TestParameterCountMismatchKeepsTheOriginalMessage(t *testing.T) {
	got := parameterCountMismatchMessage(2, 3)

	want := "[node-odbc] Error in Statement::BindAsyncWorker::Bind: The number of parameters in " +
		"the prepared statement (2) doesn't match the number of parameters passed to bind (3}."
	if got != want {
		t.Fatalf("got %q, want %q", got, want)
	}
}
