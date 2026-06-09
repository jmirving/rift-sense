import { quoteIdentifier } from "../db/migrations.js";

function tableName(schema) {
  return `${quoteIdentifier(schema)}.user_homes`;
}

export function createUserHomesRepository({ pool, schema = "riftsense" }) {
  const table = tableName(schema);

  async function initialize() {
    await pool.query(`select 1 from ${table} limit 1`);
  }

  async function getUserHome(userId) {
    const result = await pool.query(`select record from ${table} where user_id = $1`, [userId]);
    return result.rows[0]?.record ?? null;
  }

  async function saveUserHome(record) {
    await pool.query(
      `
        insert into ${table} (user_id, record, created_at, updated_at)
        values ($1, $2::jsonb, coalesce(($2::jsonb ->> 'createdAt')::timestamptz, now()), coalesce(($2::jsonb ->> 'updatedAt')::timestamptz, now()))
        on conflict (user_id) do update
        set record = excluded.record,
            updated_at = excluded.updated_at
      `,
      [record.id, JSON.stringify(record)]
    );
    return record;
  }

  async function listUserHomes() {
    const result = await pool.query(`select record from ${table} order by user_id asc`);
    return result.rows.map((row) => row.record);
  }

  return {
    initialize,
    getUserHome,
    saveUserHome,
    listUserHomes
  };
}
