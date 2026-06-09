import { quoteIdentifier } from "../db/migrations.js";

function tableName(schema) {
  return `${quoteIdentifier(schema)}.assets`;
}

export function createPostgresAssetStore({ pool, schema = "riftsense" }) {
  const table = tableName(schema);

  async function initialize() {
    await pool.query(`select 1 from ${table} limit 1`);
  }

  async function saveUploadedFile({ contentId, file }) {
    await pool.query(
      `
        insert into ${table} (content_id, original_filename, mime_type, size_bytes, bytes, created_at, updated_at)
        values ($1, $2, $3, $4, $5, now(), now())
        on conflict (content_id) do update
        set original_filename = excluded.original_filename,
            mime_type = excluded.mime_type,
            size_bytes = excluded.size_bytes,
            bytes = excluded.bytes,
            updated_at = now()
      `,
      [contentId, file.originalname, file.mimetype, file.size, file.buffer]
    );

    return {
      kind: "uploaded-file",
      originalFilename: file.originalname,
      mimeType: file.mimetype,
      sizeBytes: file.size,
      storageKey: contentId
    };
  }

  async function getAssetForItem(contentId) {
    const result = await pool.query(
      `
        select original_filename, mime_type, size_bytes, bytes
        from ${table}
        where content_id = $1
      `,
      [contentId]
    );
    const row = result.rows[0];
    if (!row) {
      return null;
    }

    return {
      originalFilename: row.original_filename,
      mimeType: row.mime_type,
      sizeBytes: row.size_bytes,
      bytes: row.bytes
    };
  }

  async function removeAssetForItem(contentId) {
    await pool.query(`delete from ${table} where content_id = $1`, [contentId]);
  }

  return {
    initialize,
    saveUploadedFile,
    getAssetForItem,
    removeAssetForItem
  };
}
