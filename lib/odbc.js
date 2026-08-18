const nativeOdbc = require('node-gyp-build')(__dirname + '/..');

const { Connection } = require('./Connection');
const { Pool } = require('./Pool');

/**
 * Opens a connection.
 * @param {string|object} connectionString - a connection string, or an object with
 *   `connectionString` and optionally `connectionTimeout` and `loginTimeout`
 * @returns {Promise<Connection>}
 */
async function connect(connectionString) {
  return new Connection(await nativeOdbc.connect(connectionString));
}

/**
 * Creates a connection pool and fills it to its initial size.
 * @param {string|object} options - a connection string, or a configuration object
 * @returns {Promise<Pool>}
 */
async function pool(options) {
  const created = new Pool(options);
  await created.init();
  return created;
}

module.exports = {
  pool,
  connect,
  ...nativeOdbc.odbcConstants(),
};
