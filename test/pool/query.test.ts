import { describe, expect, it } from "vitest";
import { pool } from "../../lib/index.ts";
import { connectionString, firstRow, qualifiedTable } from "../helpers.ts";

type Row = { ID: number; NAME: string; AGE: number };

describe(".query", () => {
  it("accepts a SQL string with no parameters", async () => {
    const createdPool = await pool({ connectionString: connectionString(), initialSize: 1 });
    const inserted = await createdPool.query(
      `INSERT INTO ${qualifiedTable()} VALUES(1, 'committed', 10)`,
    );
    expect(inserted.length).toBe(0);
    expect(inserted.count).toBe(1);
    const rows = await createdPool.query<Row>(`SELECT * FROM ${qualifiedTable()}`);
    expect(rows.length).toBe(1);
    expect(firstRow(rows)).toEqual({ ID: 1, NAME: "committed", AGE: 10 });
    await createdPool.close();
  });

  it("accepts a SQL string with bound parameters", async () => {
    const createdPool = await pool({ connectionString: connectionString(), initialSize: 1 });
    const inserted = await createdPool.query(`INSERT INTO ${qualifiedTable()} VALUES(?, ?, ?)`, [
      1,
      "committed",
      10,
    ]);
    expect(inserted.length).toBe(0);
    expect(inserted.count).toBe(1);
    const rows = await createdPool.query<Row>(`SELECT * FROM ${qualifiedTable()}`);
    expect(rows.length).toBe(1);
    expect(firstRow(rows)).toEqual({ ID: 1, NAME: "committed", AGE: 10 });
    await createdPool.close();
  });
});
