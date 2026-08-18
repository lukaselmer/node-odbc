const { decodeRows } = require('./values');

// A result is an array of rows carrying the query metadata as properties, which
// is the shape callers have always seen.
function buildResult(payload, { statement, parameters } = {}) {
  const rows = decodeRows(payload?.rows ?? []);
  rows.count = payload?.count ?? -1;
  rows.columns = payload?.columns ?? [];
  rows.statement = statement !== undefined ? statement : (payload?.statement ?? null);
  rows.parameters = parameters !== undefined ? parameters : (payload?.parameters ?? []);
  rows.return = undefined;
  return rows;
}

module.exports = { buildResult };
