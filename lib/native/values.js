// JSON cannot carry BigInt or binary data, so both travel tagged. The tags
// match the ones the Go server writes.
const BIG_INT_TAG = '$b';
const BINARY_TAG = '$d';

function replacer(key, value) {
  if (typeof value === 'bigint') return { [BIG_INT_TAG]: value.toString() };
  if (value instanceof ArrayBuffer) return { [BINARY_TAG]: bufferOf(value).toString('base64') };
  if (Buffer.isBuffer(value)) return { [BINARY_TAG]: value.toString('base64') };
  return value;
}

function bufferOf(arrayBuffer) {
  return Buffer.from(new Uint8Array(arrayBuffer));
}

// decodeRows walks a decoded result and turns the tagged objects back into the
// values the addon produced.
function decodeRows(rows) {
  return rows.map(decodeRow);
}

function decodeRow(row) {
  if (Array.isArray(row)) return row.map(decodeValue);

  const decoded = {};
  for (const [key, value] of Object.entries(row)) decoded[key] = decodeValue(value);
  return decoded;
}

function decodeValue(value) {
  if (value === null || typeof value !== 'object') return value;
  if (typeof value[BIG_INT_TAG] === 'string') return BigInt(value[BIG_INT_TAG]);
  if (typeof value[BINARY_TAG] === 'string') return arrayBufferOf(value[BINARY_TAG]);
  return value;
}

function arrayBufferOf(base64) {
  const buffer = Buffer.from(base64, 'base64');
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}

module.exports = { replacer, decodeRows, decodeValue };
