import { existsSync } from 'node:fs'
import { afterEach } from 'vitest'
import { connect } from '../lib/index.ts'
import { qualifiedTable } from './helpers.ts'

const DBMS_LIST = ['ibmi', 'mariadb', 'mssql', 'mysql', 'postgresql', 'postgres', 'sybase']

requireDbms()
loadDbmsEnv()

// Each test starts from an empty table, so they can be read in any order and
// run in any order without depending on each other's leftovers.
afterEach(async () => {
  const connection = await connect(process.env.CONNECTION_STRING ?? '')
  try {
    await connection.query(`DELETE FROM ${qualifiedTable()}`)
  } finally {
    await connection.close()
  }
})

function requireDbms(): void {
  const dbms = process.env.DBMS
  if (!dbms || !DBMS_LIST.includes(dbms)) {
    throw new Error(`Set DBMS to the database you are testing against: ${DBMS_LIST.join(', ')}.`)
  }
}

function loadDbmsEnv(): void {
  const path = `test/DBMS/${process.env.DBMS}/.env`
  if (existsSync(path)) process.loadEnvFile(path)
}
