import path from "node:path";
import { promises as fs } from "node:fs";
import { fileURLToPath } from "node:url";

const dbDir = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(dbDir, "migrations");

export function quoteIdentifier(identifier) {
  if (typeof identifier !== "string" || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(identifier)) {
    throw new Error(`Invalid Postgres identifier: ${identifier}`);
  }

  return `"${identifier.replaceAll('"', '""')}"`;
}

async function listMigrationFiles(directory = migrationsDir) {
  const entries = await fs.readdir(directory);
  return entries
    .filter((entry) => entry.endsWith(".sql"))
    .sort((left, right) => left.localeCompare(right));
}

function renderMigration(sql, schema) {
  return sql.replaceAll("__RIFTSENSE_SCHEMA__", quoteIdentifier(schema));
}

export async function runMigrations({ pool, schema = "riftsense", directory = migrationsDir }) {
  const schemaIdentifier = quoteIdentifier(schema);
  await pool.query(`create schema if not exists ${schemaIdentifier}`);
  await pool.query(`
    create table if not exists ${schemaIdentifier}.schema_migrations (
      id text primary key,
      applied_at timestamptz not null default now()
    )
  `);

  const files = await listMigrationFiles(directory);

  for (const file of files) {
    const client = await pool.connect();
    try {
      await client.query("begin");
      const existing = await client.query(
        `select id from ${schemaIdentifier}.schema_migrations where id = $1`,
        [file]
      );

      if (existing.rowCount === 0) {
        const sql = renderMigration(await fs.readFile(path.resolve(directory, file), "utf8"), schema);
        await client.query(sql);
        await client.query(
          `insert into ${schemaIdentifier}.schema_migrations (id) values ($1)`,
          [file]
        );
      }

      await client.query("commit");
    } catch (error) {
      await client.query("rollback").catch(() => {});
      throw new Error(`Failed to apply migration ${file}: ${error.message}`);
    } finally {
      client.release();
    }
  }
}
