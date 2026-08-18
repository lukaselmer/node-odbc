/**
 * Procedure parameter fixtures, used by the callProcedure tests. Only IBMi has
 * a full set; the other systems are covered by the generic tests.
 */

import BIGINT from './ibmi/procedures/BIGINT.ts';
import BINARY from './ibmi/procedures/BINARY.ts';
import CHARACTER from './ibmi/procedures/CHARACTER.ts';
import DECIMAL from './ibmi/procedures/DECIMAL.ts';
import INTEGER from './ibmi/procedures/INTEGER.ts';
import NUMERIC from './ibmi/procedures/NUMERIC.ts';
import SMALLINT from './ibmi/procedures/SMALLINT.ts';
import VARBINARY from './ibmi/procedures/VARBINARY.ts';
import VARCHAR from './ibmi/procedures/VARCHAR.ts';

export interface ProcedureValue {
  value: unknown;
  expected: unknown;
}

export interface ProcedureTest {
  name: string;
  values: { in: ProcedureValue; inout: ProcedureValue; out: ProcedureValue };
}

export interface ProcedureConfiguration {
  size: string | null;
  options: string | null;
  tests: ProcedureTest[];
}

export interface ProcedureDataType {
  dataType: string;
  configurations: ProcedureConfiguration[];
}

export const proceduresByDbms: Record<string, ProcedureDataType[] | undefined> = {
  ibmi: [BIGINT, BINARY, CHARACTER, DECIMAL, INTEGER, NUMERIC, SMALLINT, VARBINARY, VARCHAR],
};
