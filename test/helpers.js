/**
 * Test helpers for cross-DBMS compatibility.
 *
 * PostgreSQL folds unquoted identifiers to lowercase while IBMi and MSSQL
 * return them in uppercase. These helpers normalise result rows and expected
 * metadata values so that the same assertions work for every DBMS.
 */

const LOWERCASE_DBMS = ['postgres', 'postgresql'];

/**
 * Map `normalizeRow` over every element of a result array.
 */
function normalizeRows(rows) {
  if (!Array.isArray(rows)) return rows;
  return rows.map(normalizeRow);
}

/**
 * Normalise every key of a result-row object to UPPER CASE so that assertions
 * written with uppercase column names (`{ ID: 1, NAME: '…' }`) pass on every
 * DBMS.  This is a *no-op* for IBMi / MSSQL because the driver already returns
 * uppercase keys.
 */
function normalizeRow(row) {
  if (!row || typeof row !== 'object') return row;
  const out = {};
  for (const [key, value] of Object.entries(row)) {
    out[key.toUpperCase()] = value;
  }
  return out;
}

/**
 * Alias for `colName` – used when the value under test is a table name so that
 * calling code reads more naturally.
 */
function tableName(name) {
  return colName(name);
}

/**
 * Return the expected column / table name as the DBMS would report it in
 * metadata result-sets (e.g. SQLColumns, SQLPrimaryKeys, SQLTables).
 *
 * Usage:  `assert.deepEqual(idColumn.COLUMN_NAME, colName('ID'));`
 */
function colName(name) {
  return isLowercaseDbms() ? name.toLowerCase() : name;
}

function isLowercaseDbms() {
  return LOWERCASE_DBMS.includes(global.dbms);
}

module.exports = {
  normalizeRow,
  normalizeRows,
  colName,
  tableName,
  isLowercaseDbms,
};
