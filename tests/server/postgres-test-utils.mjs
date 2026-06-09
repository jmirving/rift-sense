import pg from "pg";
import { describe } from "vitest";

import { runMigrations, quoteIdentifier } from "../../server/db/migrations.js";

export const hasDatabaseUrl = typeof process.env.DATABASE_URL === "string" && process.env.DATABASE_URL.trim();
export const describeWithPostgres = hasDatabaseUrl ? describe : describe.skip;

export function uniqueSchema(prefix = "riftsense_test") {
  return `${prefix}_${process.pid}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export async function createMigratedPool(schema = uniqueSchema()) {
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL
  });
  await runMigrations({ pool, schema });
  return { pool, schema };
}

export async function dropSchema(pool, schema) {
  await pool.query(`drop schema if exists ${quoteIdentifier(schema)} cascade`);
  await pool.end();
}
