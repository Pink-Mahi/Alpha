/**
 * DB client — Postgres via `postgres` driver + Drizzle ORM.
 * M0: single connection pool; multi-tenant via org_id on every query.
 */
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema.ts";

const url = process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/ALPHA";

// Lazy: don't connect on import in tests that don't need DB.
let _client: ReturnType<typeof postgres> | null = null;
let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function getDb() {
  if (!_db) {
    _client = postgres(url, { max: 10, prepare: false });
    _db = drizzle(_client, { schema });
  }
  return _db;
}

export function closeDb(): Promise<void> {
  if (_client) {
    const c = _client;
    _client = null;
    _db = null;
    return c.end();
  }
  return Promise.resolve();
}

export { schema };
