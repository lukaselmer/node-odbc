/** The wire types exchanged with the ODBC sidecar. */

export interface OdbcErrorDetail {
  state: string;
  code: number;
  message: string;
}

export interface WireError {
  message: string;
  odbcErrors: OdbcErrorDetail[];
}

export interface WireResponse {
  id: number;
  result?: unknown;
  error?: WireError;
}

export interface WireRequest {
  id: number;
  target: RequestTarget;
  handle?: string | undefined;
  method: string;
  args?: unknown;
}

export type RequestTarget = 'odbc' | 'connection' | 'statement' | 'cursor';

export interface ColumnDefinition {
  name: string;
  dataType: number;
  dataTypeName: string;
  columnSize: number;
  decimalDigits: number;
  nullable: boolean;
}

/** The payload a query, fetch or catalog call returns. */
export interface ResultPayload {
  rows: unknown[];
  count: number;
  columns: ColumnDefinition[];
  statement: string | null;
  parameters?: unknown[];
}

export interface QueryOutcome {
  result?: ResultPayload;
  cursor?: string;
}

export interface FetchOutcome {
  result: ResultPayload;
  noData: boolean;
}

export interface HandleOutcome {
  handle: string;
}
