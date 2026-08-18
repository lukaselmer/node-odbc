import { describe, expect, it } from "vitest";
import { connect } from "../../lib/index.ts";
import { sqlTablesColumns } from "../DBMS/postgres/config.ts";
import { connectionString, schema, table, tableName } from "../helpers.ts";

type TableRow = { TABLE_SCHEM: string; TABLE_NAME: string; TABLE_TYPE: string };

describe(".tables(catalog, schema, table, type)", () => {
  it("returns information about a table", async () => {
    const connection = await connect(connectionString());
    const results = await connection.tables<TableRow>(null, schema(), table(), null);
    expect(results.length).toBe(1);
    expect(results.columns).toEqual(sqlTablesColumns);

    const result = results[0];
    if (!result) throw new Error("expected a table row");
    // TABLE_CAT and REMARKS are not asserted: they depend on the system
    expect(result.TABLE_SCHEM).toBe(tableName(schema()));
    expect(result.TABLE_NAME).toBe(tableName(table()));
    expect(result.TABLE_TYPE).toBe("TABLE");

    await connection.close();
  });

  it("returns nothing for a nonexistent schema and table", async () => {
    const connection = await connect(connectionString());
    const results = await connection.tables(null, "bad schema name", "bad table name", null);
    expect(results.length).toBe(0);
    expect(results.columns).toEqual(sqlTablesColumns);
    await connection.close();
  });
});
