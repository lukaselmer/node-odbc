import { describe, expect, it } from "vitest";
import { pool, Pool } from "../../lib/index.ts";
import { connectionString } from "../helpers.ts";

describe("initialStatements", () => {
  describe("validation", () => {
    it("defaults to running nothing", () => {
      const createdPool = new Pool(connectionString());
      expect(createdPool.initialStatements).toEqual([]);
    });

    it("keeps the statements it was given", () => {
      const createdPool = new Pool({
        connectionString: connectionString(),
        initialStatements: ["SET SESSION ISOLATION LEVEL READ COMMITTED"],
      });
      expect(createdPool.initialStatements).toEqual(["SET SESSION ISOLATION LEVEL READ COMMITTED"]);
    });

    it("rejects anything that is not an array of strings", () => {
      const invalidValues = ["SELECT 1", [1], [null], {}];
      for (const initialStatements of invalidValues) {
        expect(
          () =>
            new Pool({
              connectionString: connectionString(),
              initialStatements: initialStatements as unknown as string[],
            }),
        ).toThrow(TypeError);
      }
    });
  });

  describe("against the database", () => {
    it("hands out connections once the initial statements succeed", async () => {
      const createdPool = await pool({
        connectionString: connectionString(),
        initialSize: 2,
        initialStatements: ["SELECT 1"],
      });
      const connection = await createdPool.connect();
      const result = await connection.query("SELECT 1 AS ONE");
      expect(result.length).toBe(1);
      await connection.close();
      await createdPool.close();
    });

    it("does not hand out a connection whose initial statements failed", async () => {
      await expect(
        pool({
          connectionString: connectionString(),
          initialSize: 1,
          initialStatements: ["SELEC nonsense"],
        }),
      ).rejects.toThrow();
    });
  });
});
