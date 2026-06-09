import pg from "pg";
import { describe } from "vitest";

import { runMigrations, quoteIdentifier } from "../../server/db/migrations.js";

export const hasDatabaseUrl = typeof process.env.DATABASE_URL === "string" && process.env.DATABASE_URL.trim();
export const databaseSchema = process.env.RIFTSENSE_DB_SCHEMA || "riftsense";
export const localPostgresTestCommand =
  "DATABASE_URL=postgres://nexus:nexus@127.0.0.1:54329/nexus_suite_dev RIFTSENSE_DB_SCHEMA=riftsense npm test";
export const describeWithPostgres = hasDatabaseUrl ? describe : describe.skip;

if (!hasDatabaseUrl) {
  console.info(
    `Skipping Postgres-backed tests because DATABASE_URL is not set. Local DB example: ${localPostgresTestCommand}`
  );
}

export function uniqueSchema(prefix = `${databaseSchema}_test`) {
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
