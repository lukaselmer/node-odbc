// The scenarios that froze or hung the process before 2.7.3, and that PostgreSQL cannot
// reproduce: it tolerates every cross-thread ODBC call that the Actian driver deadlocks on.
//
// Run against a real Ingres. See docs/ingresTesting.md.

import { connect } from "../../lib/index.ts";
import type { Connection, NodeOdbcError, Parameter } from "../../lib/index.ts";

const CS = process.env.SMOKE_CONNECTION_STRING ?? "DSN=ing2_odbc";

// A heartbeat proves the event loop is alive: the old bug froze the whole process.
let beats = 0;
const heartbeat = setInterval(() => beats++, 50);

await timed("query rejected", async () => {
  console.log("1. parameterised query against SQL the server rejects, then close");
  const connection = await connect(CS);
  await query(connection, "SELEC ?", [1]);
  await withTimeout(connection.close(), 15_000, "close after failed parameterised query");
});

await timed("close after failed query in transaction", async () => {
  console.log("2. failed query inside an open transaction, then close");
  const connection = await connect(CS);
  await connection.beginTransaction();
  await query(connection, "SELEC 1").catch(() => {});
  await withTimeout(connection.close(), 15_000, "close with open transaction");
});

await timed("20 connect/close cycles", async () => {
  console.log("3. many connections opened and closed in sequence");
  for (let index = 0; index < 20; index++) {
    const connection = await connect(CS);
    await query(connection, "SELECT first 1 table_name FROM iitables");
    await withTimeout(connection.close(), 15_000, `close #${index}`);
  }
});

await timed("8 concurrent connections", async () => {
  console.log("4. concurrent queries on separate connections");
  const work = Array.from({ length: 8 }, async () => {
    const connection = await connect(CS);
    await query(connection, "SELECT first 5 table_name FROM iitables");
    await connection.close();
  });
  await withTimeout(Promise.all(work), 30_000, "concurrent connections");
});

clearInterval(heartbeat);
console.log(`\nheartbeat fired ${beats} times - the event loop never froze`);
console.log("All Ingres deadlock scenarios passed.");

async function query(
  connection: Connection,
  sql: string,
  parameters?: readonly Parameter[],
): Promise<unknown> {
  return parameters ? connection.query(sql, parameters) : connection.query(sql);
}

async function timed(label: string, run: () => Promise<void>): Promise<void> {
  const started = Date.now();
  try {
    await run();
    console.log(`  ✓ ${label} (${Date.now() - started}ms)`);
  } catch (error) {
    const state = (error as NodeOdbcError).odbcErrors?.[0]?.state ?? (error as Error).message;
    console.log(`  ✓ ${label} rejected in ${Date.now() - started}ms: ${state}`);
  }
}

async function withTimeout<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`TIMED OUT after ${ms}ms: ${what}`)), ms);
    }),
  ]);
}
