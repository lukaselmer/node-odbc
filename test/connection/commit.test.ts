import { describe, expect, it } from "vitest";
import { connect } from "../../lib/index.ts";
import { connectionString, firstRow, qualifiedTable } from "../helpers.ts";

type Row = { ID: number; NAME: string; AGE: number };

describe(".commit()", () => {
  it("commits all queries made after beginTransaction was called", async () => {
    const connection = await connect(connectionString());
    await connection.beginTransaction();
    const inserted = await connection.query(
      `INSERT INTO ${qualifiedTable()} VALUES(1, 'committed', 10)`,
    );
    expect(inserted).not.toBeNull();
    const beforeCommit = await connection.query<Row>(`SELECT * FROM ${qualifiedTable()}`);
    expect(beforeCommit.length).toBe(1);
    expect(firstRow(beforeCommit)).toEqual({ ID: 1, NAME: "committed", AGE: 10 });
    await connection.commit();
    const afterCommit = await connection.query<Row>(`SELECT * FROM ${qualifiedTable()}`);
    expect(afterCommit.length).toBe(1);
    expect(firstRow(afterCommit)).toEqual({ ID: 1, NAME: "committed", AGE: 10 });
    await connection.close();
  });

  it("has no adverse effects when called outside a transaction", async () => {
    const connection = await connect(connectionString());
    const inserted = await connection.query(
      `INSERT INTO ${qualifiedTable()} VALUES(1, 'committed', 10)`,
    );
    expect(inserted).not.toBeNull();
    await connection.commit();
    const afterFirstCommit = await connection.query<Row>(`SELECT * FROM ${qualifiedTable()}`);
    expect(afterFirstCommit.length).toBe(1);
    expect(firstRow(afterFirstCommit)).toEqual({ ID: 1, NAME: "committed", AGE: 10 });
    await connection.commit();
    const afterSecondCommit = await connection.query<Row>(`SELECT * FROM ${qualifiedTable()}`);
    expect(afterSecondCommit.length).toBe(1);
    expect(firstRow(afterSecondCommit)).toEqual({ ID: 1, NAME: "committed", AGE: 10 });
    await connection.close();
  });

  it("has no effect when called after a transaction already ended with rollback", async () => {
    const connection = await connect(connectionString());
    await connection.beginTransaction();
    const inserted = await connection.query(
      `INSERT INTO ${qualifiedTable()} VALUES(1, 'committed', 10)`,
    );
    expect(inserted).not.toBeNull();
    await connection.rollback();
    const afterRollback = await connection.query(`SELECT * FROM ${qualifiedTable()}`);
    expect(afterRollback.length).toBe(0);
    await connection.commit();
    const afterCommit = await connection.query(`SELECT * FROM ${qualifiedTable()}`);
    expect(afterCommit.length).toBe(0);
    await connection.close();
  });
});
