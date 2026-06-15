import { afterEach, expect, it } from "vitest";

import { runMigrations, quoteIdentifier } from "../../server/db/migrations.js";
import { createMigratedPool, describeWithPostgres, dropSchema, uniqueSchema } from "./postgres-test-utils.mjs";

const databases = [];

afterEach(async () => {
  await Promise.all(databases.splice(0).map(({ pool, schema }) => dropSchema(pool, schema)));
});

describeWithPostgres("Postgres migrations", () => {
  it("creates schema and applies the initial migration once", async () => {
    const database = await createMigratedPool(uniqueSchema("riftsense_migration_test"));
    databases.push(database);

    const { pool, schema } = database;
    const schemaName = quoteIdentifier(schema);

    const tables = await pool.query(
      `
        select table_name
        from information_schema.tables
        where table_schema = $1
        order by table_name
      `,
      [schema]
    );
    expect(tables.rows.map((row) => row.table_name)).toEqual([
      "assets",
      "content_items",
      "goal_types",
      "match_evaluations",
      "reviewed_moments",
      "riot_match_perspectives",
      "riot_raw_matches",
      "schema_migrations",
      "user_homes"
    ]);

    const firstRun = await pool.query(`select id from ${schemaName}.schema_migrations order by id`);
    expect(firstRun.rows).toEqual([
      { id: "001_riftsense_storage.sql" },
      { id: "002_match_evaluations.sql" },
      { id: "003_recent_game_card_indexes.sql" },
      { id: "004_reviewed_moments.sql" }
    ]);

    const indexes = await pool.query(
      `
        select indexname
        from pg_indexes
        where schemaname = $1
          and tablename = 'riot_match_perspectives'
        order by indexname
      `,
      [schema]
    );
    expect(indexes.rows.map((row) => row.indexname)).toContain("riot_match_perspectives_puuid_updated_at_idx");

    await runMigrations({ pool, schema });
    const secondRun = await pool.query(`select id from ${schemaName}.schema_migrations order by id`);
    expect(secondRun.rows).toEqual(firstRun.rows);
  });
});
