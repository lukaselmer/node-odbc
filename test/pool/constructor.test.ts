import { describe, expect, it } from "vitest";
import { Connection, pool } from "../../lib/index.ts";
import { connectionString, waitFor } from "../helpers.ts";

describe("odbc.pool", () => {
  it("opens the default number of connections when no config is passed", async () => {
    const createdPool = await pool(connectionString());
    await waitFor(() => createdPool.freeConnections.length === 10);

    expect(createdPool.freeConnections.length).toBe(10);
    await createdPool.close();
  });

  it("opens as many connections as passed with the initialSize option", async () => {
    const createdPool = await pool({ connectionString: connectionString(), initialSize: 5 });
    await waitFor(() => createdPool.freeConnections.length === 5);

    expect(createdPool.freeConnections.length).toBe(5);
    await createdPool.close();
  });

  it("has at least one free connection once connect is called", async () => {
    const createdPool = await pool(connectionString());
    const connection = await createdPool.connect();
    expect(connection).toBeInstanceOf(Connection);
    await createdPool.close();
  });
});
