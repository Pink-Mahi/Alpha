/** Health + readiness. */
import { Hono } from "hono";
import { sql } from "drizzle-orm";
import { getDb, closeDb } from "../db/client.ts";

export const healthRoutes = new Hono();

healthRoutes.get("/healthz", (c) => c.json({ ok: true }));

healthRoutes.get("/readyz", async (c) => {
  try {
    const db = getDb();
    await db.execute(sql`select 1`);
    return c.json({ ok: true, db: "up" });
  } catch (e) {
    return c.json({ ok: false, db: "down", error: String(e) }, 503);
  }
});

// For tests: close the DB pool after the process ends.
process.on("beforeExit", () => void closeDb());
