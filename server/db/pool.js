import pg from "pg";

export function createDatabasePool({ databaseUrl }) {
  if (typeof databaseUrl !== "string" || !databaseUrl.trim()) {
    throw new Error("DATABASE_URL is required for RiftSense persistence.");
  }

  return new pg.Pool({
    connectionString: databaseUrl
  });
}

export async function assertDatabaseReachable(pool) {
  try {
    await pool.query("select 1");
  } catch (error) {
    throw new Error(`Unable to connect to Postgres using DATABASE_URL: ${error.message}`);
  }
}
