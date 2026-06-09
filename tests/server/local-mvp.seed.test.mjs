import { afterEach, expect, it } from "vitest";

import { quoteIdentifier } from "../../server/db/migrations.js";
import { seedPostgresIfEmpty } from "../../scripts/local-mvp.mjs";
import { describeWithPostgres, dropSchema, uniqueSchema } from "./postgres-test-utils.mjs";

const databases = [];

afterEach(async () => {
  await Promise.all(databases.splice(0).map(({ pool, schema }) => dropSchema(pool, schema)));
});

describeWithPostgres("local MVP Postgres seed", () => {
  it("seeds content, goal types, and user homes only when empty", async () => {
    const schema = uniqueSchema("riftsense_seed_test");
    const env = {
      ...process.env,
      NODE_ENV: "test",
      PORT: "0",
      RIFTSENSE_DB_SCHEMA: schema
    };

    const first = await seedPostgresIfEmpty(env);
    databases.push({ pool: first.pool, schema });
    expect(first.seededContent).toBe(true);
    expect(first.seededUserHomes).toBe(true);

    const schemaName = quoteIdentifier(schema);
    const firstCounts = await first.pool.query(`
      select
        (select count(*)::int from ${schemaName}.content_items) as content_count,
        (select count(*)::int from ${schemaName}.goal_types) as goal_type_count,
        (select count(*)::int from ${schemaName}.user_homes) as user_home_count
    `);
    expect(firstCounts.rows[0]).toEqual({
      content_count: 3,
      goal_type_count: 7,
      user_home_count: 2
    });

    const second = await seedPostgresIfEmpty(env);
    expect(second.seededContent).toBe(false);
    expect(second.seededUserHomes).toBe(false);

    const secondCounts = await second.pool.query(`
      select
        (select count(*)::int from ${schemaName}.content_items) as content_count,
        (select count(*)::int from ${schemaName}.goal_types) as goal_type_count,
        (select count(*)::int from ${schemaName}.user_homes) as user_home_count
    `);
    expect(secondCounts.rows[0]).toEqual(firstCounts.rows[0]);
    await second.pool.end();
  });
});
