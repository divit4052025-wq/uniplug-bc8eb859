// Minimal typed surface of the D1 binding the waitlist uses (prepare → bind →
// first/all/run). Declared locally instead of depending on
// @cloudflare/workers-types, so the store stays self-contained and the ambient
// `cloudflare:workers` module (src/cloudflare-workers.d.ts) can reuse it.

export interface D1Result<T = Record<string, unknown>> {
  results: T[];
  success: boolean;
  meta?: unknown;
}

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(colName?: string): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  run<T = Record<string, unknown>>(): Promise<D1Result<T>>;
}

export interface D1Database {
  prepare(query: string): D1PreparedStatement;
}
