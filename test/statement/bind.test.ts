import { describe, expect, it } from "vitest";
import { connect } from "../../lib/index.ts";
import { connectionString, qualifiedTable } from "../helpers.ts";

type LooseBind = (...args: unknown[]) => Promise<void>;

describe(".bind(parameters)", () => {
  it("throws a TypeError when called with an invalid signature", async () => {
    const connection = await connect(connectionString());
    const statement = await connection.createStatement();
    const invalidBind = statement.bind.bind(statement) as unknown as LooseBind;
    const message = "[node-odbc]: statement.bind requires the parameters to be an array.";

    await expect(invalidBind()).rejects.toThrow(message);
    await expect(invalidBind(1)).rejects.toThrow(message);
    await expect(invalidBind(null)).rejects.toThrow(message);
    await expect(invalidBind(undefined)).rejects.toThrow(message);
    await expect(invalidBind({})).rejects.toThrow(message);

    await connection.close();
  });

  it("binds a prepared statement to valid parameter values", async () => {
    const connection = await connect(connectionString());
    const statement = await connection.createStatement();
    await statement.prepare(`INSERT INTO ${qualifiedTable()} VALUES(?, ?, ?)`);
    await expect(statement.bind([1, "bound1", 10])).resolves.not.toThrow();
    await connection.close();
  });

  it("binds even when parameter types do not match the prepared statement", async () => {
    const connection = await connect(connectionString());
    const statement = await connection.createStatement();
    await statement.prepare(`INSERT INTO ${qualifiedTable()} VALUES(?, ?, ?)`);
    await expect(statement.bind(["ID", 1, "AGE"])).resolves.not.toThrow();
    await connection.close();
  });

  it("rejects an incorrect number of parameters for the prepared statement", async () => {
    const connection = await connect(connectionString());
    const statement = await connection.createStatement();
    await statement.prepare(`INSERT INTO ${qualifiedTable()} VALUES(?, ?, ?)`);
    await expect(statement.bind([1, "bound"])).rejects.toThrow();
    await connection.close();
  });

  it("rejects binding before prepare has been called, with parameters", async () => {
    const connection = await connect(connectionString());
    const statement = await connection.createStatement();
    await expect(statement.bind([1, "bound", 10])).rejects.toThrow();
    await connection.close();
  });

  it("rejects binding before prepare has been called, with no parameters", async () => {
    const connection = await connect(connectionString());
    const statement = await connection.createStatement();
    await expect(statement.bind([])).rejects.toThrow();
    await connection.close();
  });
});
