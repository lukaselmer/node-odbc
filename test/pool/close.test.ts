import { describe, expect, it } from "vitest";
import { pool } from "../../lib/index.ts";
import { connectionString } from "../helpers.ts";

describe(".close()", () => {
  it("closes all connections in the pool", async () => {
    const createdPool = await pool(connectionString());
    await delay(5000);
    expect(createdPool.freeConnections.length).toBe(10);
    await createdPool.close();
    expect(createdPool.freeConnections.length).toBe(0);
  });
});

async function delay(milliseconds: number): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}
