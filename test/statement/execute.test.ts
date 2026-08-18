import { describe, expect, it } from "vitest";
import { connect } from "../../lib/index.ts";
import { connectionString, firstRow, qualifiedTable } from "../helpers.ts";

type Row = { ID: number; NAME: string; AGE: number };

describe(".execute()", () => {
  it("executes a prepared statement with bound values", async () => {
    const connection = await connect(connectionString());
    const statement = await connection.createStatement();
    await statement.prepare(`INSERT INTO ${qualifiedTable()} VALUES(?, ?, ?)`);
    await statement.bind([1, "bound", 10]);
    const result = await statement.execute();
    expect(result).not.toBeNull();
    expect(result.count).toBe(1);
    const rows = await connection.query<Row>(`SELECT * FROM ${qualifiedTable()}`);
    expect(rows.length).toBe(1);
    expect(firstRow(rows)).toEqual({ ID: 1, NAME: "bound", AGE: 10 });
    await connection.close();
  });

  it("executes a prepared statement with no parameters without calling bind", async () => {
    const connection = await connect(connectionString());
    const statement = await connection.createStatement();
    await statement.prepare(`INSERT INTO ${qualifiedTable()} VALUES(1, 'bound', 10)`);
    const result = await statement.execute();
    expect(result).not.toBeNull();
    expect(result.count).toBe(1);
    const rows = await connection.query<Row>(`SELECT * FROM ${qualifiedTable()}`);
    expect(rows.length).toBe(1);
    expect(firstRow(rows)).toEqual({ ID: 1, NAME: "bound", AGE: 10 });
    await connection.close();
  });

  it("rejects executing before prepare has been called", async () => {
    const connection = await connect(connectionString());
    const statement = await connection.createStatement();
    await expect(statement.execute()).rejects.toThrow();
    await connection.close();
  });

  it("rejects executing when bind has not been called and the statement expects parameters", async () => {
    const connection = await connect(connectionString());
    const statement = await connection.createStatement();
    await statement.prepare(`INSERT INTO ${qualifiedTable()} VALUES(?, ?, ?)`);
    await expect(statement.execute()).rejects.toThrow();
    await connection.close();
  });

  it("rejects executing when bound values are incompatible with the target columns", async () => {
    const connection = await connect(connectionString());
    const statement = await connection.createStatement();
    await statement.prepare(`INSERT INTO ${qualifiedTable()} VALUES(?, ?, ?)`);
    await statement.bind(["ID", 10, "AGE"]);
    await expect(statement.execute()).rejects.toThrow();
    await connection.close();
  });
});
