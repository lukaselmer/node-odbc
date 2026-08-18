const { client } = require('./client');
const { connectionOptionsOf } = require('./connectionOptions');
const { Connection } = require('../Connection');

// Opening a connection is shared by connect() and the pool, which needs the
// same handshake but manages the lifetime of the result itself.
async function openConnection(connectionStringOrOptions) {
  const options = connectionOptionsOf(connectionStringOrOptions);

  const { handle } = await client.request('odbc', undefined, 'connect', options);
  return new Connection(handle, { fetchArray: options.fetchArray });
}

module.exports = { openConnection };
