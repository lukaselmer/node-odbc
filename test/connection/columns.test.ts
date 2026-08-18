import { describe, expect, it } from "vitest";
import { connect, SQL_INTEGER, SQL_NULLABLE, SQL_VARCHAR } from "../../lib/index.ts";
import { sqlColumnsColumns } from "../DBMS/postgres/config.ts";
import { colName, connectionString, schema, table } from "../helpers.ts";

type ColumnRow = { COLUMN_NAME: string; DATA_TYPE: number; NULLABLE: number };

describe(".columns(catalog, schema, table, column)", () => {
  it("returns information about all columns of a table", async () => {
    const connection = await connect(connectionString());
    const results = await connection.columns<ColumnRow>(null, schema(), table(), null);
    expect(results.length).toBe(3);
    expect(results.columns).toEqual(sqlColumnsColumns);

    const idColumn = results[0];
    if (!idColumn) throw new Error("expected an ID column");
    expect(idColumn.COLUMN_NAME).toBe(colName("ID"));
    expect(idColumn.DATA_TYPE).toBe(SQL_INTEGER);
    expect(idColumn.NULLABLE).toBe(SQL_NULLABLE);

    const nameColumn = results[1];
    if (!nameColumn) throw new Error("expected a NAME column");
    expect(nameColumn.COLUMN_NAME).toBe(colName("NAME"));
    expect(nameColumn.DATA_TYPE).toBe(SQL_VARCHAR);
    expect(nameColumn.NULLABLE).toBe(SQL_NULLABLE);

    const ageColumn = results[2];
    if (!ageColumn) throw new Error("expected an AGE column");
    expect(ageColumn.COLUMN_NAME).toBe(colName("AGE"));
    expect(ageColumn.DATA_TYPE).toBe(SQL_INTEGER);
    expect(ageColumn.NULLABLE).toBe(SQL_NULLABLE);

    await connection.close();
  });

  it("returns nothing for a nonexistent schema and table", async () => {
    const connection = await connect(connectionString());
    const results = await connection.columns(null, "bad schema name", "bad table name", null);
    expect(results.length).toBe(0);
    expect(results.columns).toEqual(sqlColumnsColumns);
    await connection.close();
  });
});
