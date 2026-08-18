// Connection cost, for when the pool tests look slow.
//
// The pool opens connections one at a time, so filling it costs that many round
// trips in sequence. See lib/connectionQueue.ts.

import { connect } from "../../lib/index.ts";

const CS = process.env.SMOKE_CONNECTION_STRING ?? "DSN=PGRUSTPORT;UID=lukaselmer";
const COUNT = 10;

await sequential();
await parallel();

async function sequential(): Promise<void> {
  const started = Date.now();
  for (let index = 0; index < COUNT; index++) {
    const connection = await connect(CS);
    await connection.close();
  }
  report("one at a time", started);
}

async function parallel(): Promise<void> {
  const started = Date.now();
  const connections = await Promise.all(Array.from({ length: COUNT }, () => connect(CS)));
  await Promise.all(connections.map((connection) => connection.close()));
  report("all at once", started);
}

function report(label: string, started: number): void {
  const elapsed = Date.now() - started;
  console.log(
    `${COUNT} connections ${label}: ${elapsed}ms (${Math.round(elapsed / COUNT)}ms each)`,
  );
}
