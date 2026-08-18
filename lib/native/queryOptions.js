// The addon validated query options natively and reported the failure through
// the callback. The messages are reproduced exactly.
function parseQueryOptions(options) {
  if (options === null || options === undefined) return null;

  return {
    cursor: parseCursor(options.cursor),
    fetchSize: parsePositive(options.fetchSize, 'fetchSize'),
    timeout: parsePositive(options.timeout, 'timeout'),
    initialBufferSize: parsePositive(options.initialBufferSize, 'initialBufferSize'),
  };
}

function parseCursor(cursor) {
  if (cursor === undefined) return false;
  if (typeof cursor === 'boolean' || typeof cursor === 'string') return cursor;
  throw new TypeError('Connection.query options: .cursor must be a STRING or BOOLEAN value.');
}

function parsePositive(value, name) {
  if (value === undefined) return 0;
  if (typeof value !== 'number') {
    throw new TypeError(`Connection.query options: .${name} must be a NUMBER value.`);
  }
  if (value <= 0) {
    throw new RangeError(`Connection.query options: .${name} must be greater than 0.`);
  }
  return value;
}

module.exports = { parseQueryOptions };
