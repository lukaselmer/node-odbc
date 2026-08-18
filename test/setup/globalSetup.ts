import { connect } from '../../src/odbc.ts';
import {
  connectionString,
  loadDbmsConfig,
  loadDbmsEnvironment,
  qualifiedTable,
  selectedDbms,
} from './dbms.ts';

const OBJECT_EXISTS_STATE = -601;

/** Creates the table the suite shares, and drops it again afterwards. */
export async function setup(): Promise<() => Promise<void>> {
  const dbms = selectedDbms();
  loadDbmsEnvironment(dbms);
  const config = await loadDbmsConfig(dbms);

  await withConnection(async (connection) => {
    const queries = config.generateCreateOrReplaceQueries(
      qualifiedTable(),
      '(ID INTEGER, NAME VARCHAR(24), AGE INTEGER)',
    );
    for (const query of queries) await connection.query(query);
  }, OBJECT_EXISTS_STATE);

  return async () => {
    await withConnection(async (connection) => {
      await connection.query(`DROP TABLE ${qualifiedTable()}`);
    });
  };
}

async function withConnection(
  work: (connection: Awaited<ReturnType<typeof connect>>) => Promise<void>,
  toleratedState?: number,
): Promise<void> {
  const connection = await connect(connectionString());
  try {
    await work(connection);
  } catch (error) {
    if (!isToleratedError(error, toleratedState)) throw error;
  } finally {
    await connection.close();
  }
}

function isToleratedError(error: unknown, toleratedState: number | undefined): boolean {
  if (toleratedState === undefined) return false;
  const details = (error as { odbcErrors?: { code: number }[] }).odbcErrors;
  return details?.[0]?.code === toleratedState;
}
