/**
 * migrate.ts — runs pending SQL migrations from ./migrations.
 * Wraps drizzle's migrator. Run: bun run db:migrate
 */
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const url = process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/ALPHA";

const sql = postgres(url, { max: 1, prepare: false });
const db = drizzle(sql);

const migrationsFolder = new URL("./migrations", import.meta.url).pathname;

await migrate(db, { migrationsFolder });
console.log("[db] migrations applied");
await sql.end();
