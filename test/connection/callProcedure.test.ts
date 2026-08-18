import assert from 'node:assert/strict';
import { afterAll, beforeAll, describe, it } from 'vitest';

import { connect } from '../../src/odbc.ts';
import type { Connection } from '../../src/connection.ts';
import { proceduresByDbms, type ProcedureTest } from '../DBMS/procedures.ts';
import { connectionString, schema } from '../setup/dbms.ts';
import { dbms } from '../setup/testEnv.ts';

const procedureDataTypes = proceduresByDbms[dbms()] ?? [];

describe.skipIf(procedureDataTypes.length === 0)(
  '...testing IN, INOUT, and OUT parameters...',
  () => {
    for (const { dataType, configurations } of procedureDataTypes) {
      describe(`...for ${dataType}...`, () => {
        configurations.forEach(({ size, options, tests }, index) => {
          const fieldConfiguration = `${size ? `${size} ` : ''}${options ? `${options} ` : ''}`;
          const procedureName = `${dataType}${index}_IN_INOUT_OUT`;

          describe(`...with ${fieldConfiguration || 'default field configuration'}...`, () => {
            let connection!: Connection;

            beforeAll(async () => {
              connection = await connect(connectionString());
              await connection.query(createProcedure(procedureName, dataType, size, options));
            });

            afterAll(async () => {
              await connection.query(`DROP PROCEDURE ${schema()}.${procedureName}`);
              await connection.close();
            });

            for (const test of tests) {
              // oxlint-disable-next-line no-loop-func -- for..of binds per iteration
              it(`...testing ${test.name}.`, async () => {
                await runProcedureTest(connection, procedureName, test);
              });
            }
          });
        });
      });
    }
  },
);

async function runProcedureTest(
  connection: Connection,
  procedureName: string,
  { values }: ProcedureTest,
): Promise<void> {
  const parameters = [values.in.value, values.inout.value, values.out.value];
  const expected = [values.in.expected, values.inout.expected, values.out.expected];

  const results = await connection.callProcedure(null, schema(), procedureName, parameters);

  assert.deepEqual(results.parameters, expected);
}

function createProcedure(
  procedureName: string,
  dataType: string,
  size: string | null,
  options: string | null,
): string {
  const field = `${dataType} ${size ?? ''} ${options ?? ''}`;
  return `CREATE OR REPLACE PROCEDURE ${schema()}.${procedureName} (
    IN IN_${dataType} ${field},
    INOUT INOUT_${dataType} ${field},
    OUT OUT_${dataType} ${field}
  )
  LANGUAGE SQL
  MODIFIES SQL DATA
  PROGRAM TYPE SUB
  CONCURRENT ACCESS RESOLUTION DEFAULT
  DYNAMIC RESULT SETS 0
  OLD SAVEPOINT LEVEL
  COMMIT ON RETURN NO
  BEGIN
  SET OUT_${dataType} = INOUT_${dataType};
  SET INOUT_${dataType} = IN_${dataType};
  END`;
}
