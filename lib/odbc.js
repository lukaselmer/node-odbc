const { openConnection } = require('./native/connect');
const { odbcConstants } = require('./native/constants');
const { Pool } = require('./Pool');

/**
 * Opens a connection to the database.
 * @param {string|object} connectionStringOrOptions a connection string, or an
 * object with `connectionString` and optionally `connectionTimeout`,
 * `loginTimeout` and `fetchArray`.
 * @returns {Promise<Connection>}
 */
function connect(connectionStringOrOptions) {
  return openConnection(connectionStringOrOptions);
}

/**
 * Creates and initialises a connection pool.
 * @param {string|object} connectionStringOrOptions
 * @returns {Promise<Pool>}
 */
async function pool(connectionStringOrOptions) {
  const pooled = new Pool(connectionStringOrOptions);
  await pooled.init();
  return pooled;
}

module.exports = {
  pool,
  connect,
  ...odbcConstants,
};
