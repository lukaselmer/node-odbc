// JSON cannot carry BigInt or binary data, so both travel tagged. The tags
// match the ones the Go server writes.
const BIG_INT_TAG = '$b';
const BINARY_TAG = '$d';

type TaggedBigInt = { [BIG_INT_TAG]: string };
type TaggedBinary = { [BINARY_TAG]: string };

export function replacer(_key: string, value: unknown): unknown {
  if (typeof value === 'bigint') return { [BIG_INT_TAG]: value.toString() };
  if (value instanceof ArrayBuffer) return { [BINARY_TAG]: bufferOf(value).toString('base64') };
  if (Buffer.isBuffer(value)) return { [BINARY_TAG]: value.toString('base64') };
  return value;
}

function bufferOf(arrayBuffer: ArrayBuffer): Buffer {
  return Buffer.from(new Uint8Array(arrayBuffer));
}

/** Turns the tagged objects back into the values the caller expects. */
export function decodeRows(rows: unknown[]): unknown[] {
  return rows.map((row) => decodeRow(row));
}

function decodeRow(row: unknown): unknown {
  if (Array.isArray(row)) return row.map((value) => decodeValue(value));
  if (!isRecord(row)) return row;

  return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, decodeValue(value)]));
}

export function decodeValue(value: unknown): unknown {
  if (!isRecord(value)) return value;
  if (isTaggedBigInt(value)) return BigInt(value[BIG_INT_TAG]);
  if (isTaggedBinary(value)) return arrayBufferOf(value[BINARY_TAG]);
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isTaggedBigInt(value: Record<string, unknown>): value is TaggedBigInt {
  return typeof value[BIG_INT_TAG] === 'string';
}

function isTaggedBinary(value: Record<string, unknown>): value is TaggedBinary {
  return typeof value[BINARY_TAG] === 'string';
}

function arrayBufferOf(base64: string): ArrayBuffer {
  const buffer = Buffer.from(base64, 'base64');
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}
