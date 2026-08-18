export interface ConnectionParameters {
  connectionString: string;
  connectionTimeout?: number;
  loginTimeout?: number;
  fetchArray?: boolean;
}

export interface WireConnectionOptions {
  connectionString: string;
  connectionTimeout: number;
  loginTimeout: number;
  fetchArray: boolean;
}

/** Validation of the argument accepted by connect() and pool(). */
export function connectionOptionsOf(value: string | ConnectionParameters): WireConnectionOptions {
  if (typeof value === 'string') return withDefaults({ connectionString: value });

  if (typeof value !== 'object' || value === null) {
    throw new TypeError('connect: first parameter must be a string or an object.');
  }
  if (typeof value.connectionString !== 'string') {
    throw new TypeError(
      "connect: A configuration object must have a 'connectionString' property that is a string.",
    );
  }
  return withDefaults(value);
}

function withDefaults(value: ConnectionParameters): WireConnectionOptions {
  return {
    connectionString: value.connectionString,
    connectionTimeout: numberOr(value.connectionTimeout, 0),
    loginTimeout: numberOr(value.loginTimeout, 0),
    fetchArray: value.fetchArray === true,
  };
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' ? value : fallback;
}
