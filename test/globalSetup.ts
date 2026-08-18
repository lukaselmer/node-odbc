import { existsSync } from 'node:fs'
import { connect } from '../lib/index.ts'

/** The table every test reads and writes, created once for the whole run. */
export async function setup(): Promise<void> {
  loadDbmsEnv()

  const connection = await connect(process.env.CONNECTION_STRING ?? '')
  try {
    await connection.query(`DROP TABLE ${qualifiedTable()}`).catch(() => {})
    await connection.query(
      `CREATE TABLE ${qualifiedTable()} (ID INTEGER, NAME VARCHAR(24), AGE INTEGER)`,
    )
  } finally {
    await connection.close()
  }
}

export async function teardown(): Promise<void> {
  loadDbmsEnv()

  const connection = await connect(process.env.CONNECTION_STRING ?? '')
  try {
    await connection.query(`DROP TABLE ${qualifiedTable()}`).catch(() => {})
  } finally {
    await connection.close()
  }
}

function qualifiedTable(): string {
  return `${process.env.DB_SCHEMA}.${process.env.DB_TABLE}`
}

/** Variables already in the environment win, so a `.env` only fills the gaps. */
function loadDbmsEnv(): void {
  const path = `test/DBMS/${process.env.DBMS}/.env`
  if (existsSync(path)) process.loadEnvFile(path)
}
