import { quoteIdentifier } from "../db/migrations.js";

function tableName(schema) {
  return `${quoteIdentifier(schema)}.content_items`;
}

function normalizeTopic(value) {
  return String(value ?? "").trim().toLowerCase();
}

export function createContentItemsRepository({ pool, schema = "riftsense" }) {
  const table = tableName(schema);

  async function initialize() {
    await pool.query(`select 1 from ${table} limit 1`);
  }

  async function getContentItem(id) {
    const result = await pool.query(`select record from ${table} where id = $1`, [id]);
    return result.rows[0]?.record ?? null;
  }

  async function saveContentItem(record) {
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

  async function listContentItems(filters = {}) {
    const clauses = [];
    const values = [];

    if (filters.status) {
      values.push(filters.status);
      clauses.push(`status = $${values.length}`);
    }
    if (filters.contentType) {
      values.push(filters.contentType);
      clauses.push(`content_type = $${values.length}`);
    }
    if (filters.topic) {
      values.push(JSON.stringify([normalizeTopic(filters.topic)]));
      clauses.push(`record -> 'topicTags' @> $${values.length}::jsonb`);
    }

    const where = clauses.length > 0 ? `where ${clauses.join(" and ")}` : "";
    const result = await pool.query(
      `select record from ${table} ${where} order by updated_at desc`,
      values
    );

    return result.rows.map((row) => row.record);
  }

  async function deleteContentItem(id) {
    const result = await pool.query(`delete from ${table} where id = $1`, [id]);
    return result.rowCount > 0;
  }

  return {
    initialize,
    getContentItem,
    saveContentItem,
    listContentItems,
    deleteContentItem
  };
}
