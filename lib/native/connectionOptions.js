// Validation of the argument accepted by connect() and pool().

function connectionOptionsOf(value) {
  if (typeof value === 'string') return { connectionString: value };

  if (value === null || typeof value !== 'object') {
    throw new TypeError('connect: first parameter must be a string or an object.');
  }
  if (typeof value.connectionString !== 'string') {
    throw new TypeError(
      "connect: A configuration object must have a 'connectionString' property that is a string."
    );
  }

  return {
    connectionString: value.connectionString,
    connectionTimeout: numberOr(value.connectionTimeout, 0),
    loginTimeout: numberOr(value.loginTimeout, 0),
    fetchArray: value.fetchArray === true,
  };
}

function numberOr(value, fallback) {
  return typeof value === 'number' ? value : fallback;
}

module.exports = { connectionOptionsOf };
