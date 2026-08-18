import type { Connection } from '../../src/connection.ts';
import { describe, it, beforeEach, afterEach } from 'vitest';
import assert from 'node:assert';
import * as odbc from '../../src/odbc.ts';

describe.skip('.setIsolationLevel(isolationLevel)...', () => {
  let connection!: Connection;
  beforeEach(async () => {
    connection = await odbc.connect(`${process.env['CONNECTION_STRING']}`);
  });

  afterEach(async () => {
    await connection.close();
  });
  describe('...with promises...', () => {
    it('...should not error if no transaction has been started', async () => {
      await assert.doesNotReject(connection.setIsolationLevel(1));
    });
  }); // ...with promises...
});
