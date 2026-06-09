import { quoteIdentifier } from "../db/migrations.js";

function tableName(schema) {
  return `${quoteIdentifier(schema)}.goal_types`;
}

export function createGoalTypesRepository({ pool, schema = "riftsense" }) {
  const table = tableName(schema);

  async function initialize() {
    await pool.query(`select 1 from ${table} limit 1`);
  }

  async function getGoalType(id) {
    const result = await pool.query(`select record from ${table} where id = $1`, [id]);
    return result.rows[0]?.record ?? null;
  }

  async function saveGoalType(record) {
    await pool.query(
      `
        insert into ${table} (id, record, created_at, updated_at)
        values ($1, $2::jsonb, coalesce(($2::jsonb ->> 'createdAt')::timestamptz, now()), coalesce(($2::jsonb ->> 'updatedAt')::timestamptz, now()))
        on conflict (id) do update
        set record = excluded.record,
            updated_at = excluded.updated_at
      `,
      [record.id, JSON.stringify(record)]
    );
    return record;
  }

  async function listGoalTypes(filters = {}) {
    const values = [];
    const clauses = [];

    if (filters.activeOption !== undefined) {
      values.push(filters.activeOption);
      clauses.push(`is_active_option = $${values.length}`);
    }

    const where = clauses.length > 0 ? `where ${clauses.join(" and ")}` : "";
    const result = await pool.query(`select record from ${table} ${where} order by id asc`, values);
    return result.rows.map((row) => row.record);
  }

  return {
    initialize,
    getGoalType,
    saveGoalType,
    listGoalTypes
  };
}
