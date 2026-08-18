// End-to-end check against a real database, covering what the unit tests cannot:
// the driver, the addon and the JavaScript layer together.
//
//   SMOKE_CONNECTION_STRING='DSN=…' node test/manual/smoke.ts
//
// Needs the table described in docs/rustPort.md.

import assert from "node:assert/strict";
import { connect, pool } from "../../lib/index.ts";
import type { NodeOdbcError } from "../../lib/index.ts";

const CS = process.env.SMOKE_CONNECTION_STRING;
if (!CS) {
  console.error("Set SMOKE_CONNECTION_STRING, e.g. DSN=PGRUSTPORT;UID=me");
  process.exit(1);
}
const TABLE = process.env.SMOKE_TABLE ?? "rustsmoke";

interface Row {
  id: number;
  name: string | null;
  age: number | null;
  bignum: bigint | null;
  ratio: number | null;
  payload: Buffer | null;
}

const ok = (message: string): void => console.log("  ✓", message);

const connection = await connect(CS);

const rows = await connection.query<Row>(`SELECT * FROM ${TABLE} ORDER BY id`);
assert.equal(rows.length, 2);
assert.equal(rows[0]?.name, "anna");
assert.equal(rows[0]?.bignum, 9007199254740993n);
assert.equal(rows[1]?.age, null);
assert.ok(Buffer.isBuffer(rows[0]?.payload));
assert.deepEqual([...(rows[0]?.payload ?? [])], [1, 2]);
ok("rows, types, nulls, bigint precision, binary");

assert.equal(rows.statement, `SELECT * FROM ${TABLE} ORDER BY id`);
assert.equal(rows.columns.length, 6);
assert.deepEqual(rows.columns[0], {
  name: "id",
  dataType: 4,
  dataTypeName: "SQL_INTEGER",
  columnSize: 10,
  decimalDigits: 0,
  nullable: false,
});
assert.equal(rows.return, undefined);
ok("result metadata: statement, columns, return");

const one = await connection.query<Row>(`SELECT * FROM ${TABLE} WHERE id = ?`, [1]);
assert.equal(one.length, 1);
assert.equal(one[0]?.name, "anna");

const byName = await connection.query<Row>(`SELECT * FROM ${TABLE} WHERE name = ?`, ["bob"]);
assert.equal(byName[0]?.id, 2);

const nullParam = await connection.query<Row>(
  `SELECT * FROM ${TABLE} WHERE age IS NOT DISTINCT FROM ?`,
  [null],
);
assert.equal(nullParam.length, 1);
assert.equal(nullParam[0]?.id, 2);
ok("parameters: number, string, null");

const inserted = await connection.query(
  `INSERT INTO ${TABLE} VALUES (3, 'carol', 7, 1, 0.5, NULL)`,
);
assert.equal(inserted.length, 0);
assert.equal(inserted.count, 1);

const updated = await connection.query(`UPDATE ${TABLE} SET age = 8 WHERE id = 3`);
assert.equal(updated.count, 1);

const deleted = await connection.query(`DELETE FROM ${TABLE} WHERE id = 3`);
assert.equal(deleted.count, 1);
ok("INSERT/UPDATE/DELETE report count");

const statement = await connection.createStatement();
await statement.prepare(`SELECT * FROM ${TABLE} WHERE id = ?`);
await statement.bind([2]);
const prepared = await statement.execute<Row>();
assert.equal(prepared.length, 1);
assert.equal(prepared[0]?.name, "bob");
await statement.close();
ok("prepare / bind / execute / close");

await connection.beginTransaction();
await connection.query(`INSERT INTO ${TABLE} VALUES (9, 'rolled back', 1, 1, 1, NULL)`);
await connection.rollback();
assert.equal((await connection.query(`SELECT * FROM ${TABLE} WHERE id = 9`)).length, 0);

await connection.beginTransaction();
await connection.query(`INSERT INTO ${TABLE} VALUES (9, 'committed', 1, 1, 1, NULL)`);
await connection.commit();
assert.equal((await connection.query(`SELECT * FROM ${TABLE} WHERE id = 9`)).length, 1);
await connection.query(`DELETE FROM ${TABLE} WHERE id = 9`);
ok("transactions: rollback and commit");

await assert.rejects(connection.query("SELEC nonsense"), (error: unknown) => {
  const failure = error as NodeOdbcError;
  assert.ok(Array.isArray(failure.odbcErrors), "odbcErrors is an array");
  assert.ok(failure.odbcErrors.length > 0, "odbcErrors is not empty");
  assert.equal(typeof failure.odbcErrors[0]?.state, "string");
  assert.equal(typeof failure.odbcErrors[0]?.code, "number");
  assert.ok((failure.odbcErrors[0]?.message.length ?? 0) > 0);
  return true;
});
ok("errors carry state/code/message");

const survived = await connection.query<{ one: number }>("SELECT 1 AS one");
assert.equal(survived[0]?.one, 1);
ok("connection survives a failed statement");

await connection.close();
ok("close");

const created = await pool({
  connectionString: CS,
  initialSize: 2,
  initialStatements: ["SET SESSION CHARACTERISTICS AS TRANSACTION ISOLATION LEVEL READ COMMITTED"],
});
const pooled = await created.connect();
const level = await pooled.query<{ transaction_isolation: string }>("SHOW transaction_isolation");
assert.equal(level[0]?.transaction_isolation, "read committed");
ok(`pool initialStatements applied: ${level[0]?.transaction_isolation}`);
await pooled.close();
await created.close();
ok("pool close");

console.log("\nAll smoke tests passed.");
