import { describe, expect, it } from "vitest";
import { connect } from "../../lib/index.ts";
import { connectionString, firstRow, qualifiedTable } from "../helpers.ts";

type Row = { ID: number; NAME: string; AGE: number };
type LooseQuery = (...args: unknown[]) => Promise<unknown>;

describe(".query(sql, [parameters])", () => {
  it("throws a TypeError when called with an invalid signature", async () => {
    const connection = await connect(connectionString());
    const invalidQuery = connection.query.bind(connection) as unknown as LooseQuery;

    const sqlTypeError = "[node-odbc]: connection.query requires the SQL to be a string.";
    await expect(invalidQuery()).rejects.toThrow(sqlTypeError);
    await expect(invalidQuery(1, [])).rejects.toThrow(sqlTypeError);
    await expect(invalidQuery(1, 1)).rejects.toThrow(sqlTypeError);

    const parametersTypeError =
      "[node-odbc]: connection.query requires the parameters to be an array.";
    await expect(invalidQuery(`SELECT * FROM ${qualifiedTable()}`, 1)).rejects.toThrow(
      parametersTypeError,
    );

    await connection.close();
  });

  it("accepts a SQL string with no parameters", async () => {
    const connection = await connect(connectionString());
    const inserted = await connection.query(
      `INSERT INTO ${qualifiedTable()} VALUES(1, 'committed', 10)`,
    );
    expect(inserted.length).toBe(0);
    expect(inserted.count).toBe(1);
    const rows = await connection.query<Row>(`SELECT * FROM ${qualifiedTable()}`);
    expect(rows.length).toBe(1);
    expect(firstRow(rows)).toEqual({ ID: 1, NAME: "committed", AGE: 10 });
    await connection.close();
  });

  it("accepts a SQL string with bound parameters", async () => {
    const connection = await connect(connectionString());
    const inserted = await connection.query(`INSERT INTO ${qualifiedTable()} VALUES(?, ?, ?)`, [
      1,
      "committed",
      10,
    ]);
    expect(inserted.length).toBe(0);
    expect(inserted.count).toBe(1);
    const rows = await connection.query<Row>(`SELECT * FROM ${qualifiedTable()}`);
    expect(rows.length).toBe(1);
    expect(firstRow(rows)).toEqual({ ID: 1, NAME: "committed", AGE: 10 });
    await connection.close();
  });
});
