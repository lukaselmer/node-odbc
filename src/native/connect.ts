import { Connection } from '../connection.ts';
import { client } from './client.ts';
import { connectionOptionsOf, type ConnectionParameters } from './connectionOptions.ts';
import type { HandleOutcome } from './protocol.ts';

/**
 * Opening a connection is shared by connect() and the pool, which needs the
 * same handshake but manages the lifetime of the result itself.
 */
export async function openConnection(
  connectionStringOrOptions: string | ConnectionParameters,
): Promise<Connection> {
  const options = connectionOptionsOf(connectionStringOrOptions);

  const outcome = await client.request<HandleOutcome>('odbc', undefined, 'connect', options);
  return new Connection(outcome.handle);
}
