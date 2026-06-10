import { quoteIdentifier } from "../db/migrations.js";

function rawTableName(schema) {
  return `${quoteIdentifier(schema)}.riot_raw_matches`;
}

function perspectivesTableName(schema) {
  return `${quoteIdentifier(schema)}.riot_match_perspectives`;
}

function toIso(value) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function rowToRawMatch(row) {
  if (!row) {
    return null;
  }

  return {
    matchId: row.match_id,
    summaryJson: row.summary_json,
    timelineJson: row.timeline_json,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at)
  };
}

function rowToRecentGameCard(row) {
  if (!row) {
    return null;
  }

  return {
    matchId: row.match_id,
    puuid: row.puuid,
    record: row.record,
    updatedAt: toIso(row.updated_at)
  };
}

function isFreshRecord(record, { now = new Date(), maxAgeMs = null } = {}) {
  if (!record?.summaryJson || !record?.timelineJson) {
    return false;
  }

  if (!Number.isFinite(maxAgeMs) || maxAgeMs <= 0) {
    return true;
  }

  const updatedAt = Date.parse(record.updatedAt ?? record.createdAt ?? "");
  return Number.isFinite(updatedAt) && now.getTime() - updatedAt <= maxAgeMs;
}

export function createRiotMatchesRepository({ pool, schema = "riftsense" }) {
  const rawTable = rawTableName(schema);
  const perspectivesTable = perspectivesTableName(schema);

  async function initialize() {
    await Promise.all([
      pool.query(`select 1 from ${rawTable} limit 1`),
      pool.query(`select 1 from ${perspectivesTable} limit 1`)
    ]);
  }

  async function getRawMatchData(matchId) {
    const result = await pool.query(`select * from ${rawTable} where match_id = $1`, [matchId]);
    return rowToRawMatch(result.rows[0]);
  }

  async function saveRawMatchData({ matchId, summaryJson, timelineJson, now = new Date() }) {
    const timestamp = now.toISOString();
    const result = await pool.query(
      `
        insert into ${rawTable} (match_id, summary_json, timeline_json, created_at, updated_at)
        values ($1, $2::jsonb, $3::jsonb, $4::timestamptz, $4::timestamptz)
        on conflict (match_id) do update
        set summary_json = excluded.summary_json,
            timeline_json = excluded.timeline_json,
            updated_at = excluded.updated_at
        returning *
      `,
      [matchId, JSON.stringify(summaryJson), JSON.stringify(timelineJson), timestamp]
    );
    return rowToRawMatch(result.rows[0]);
  }

  async function hasFreshRawMatchData(matchId, options) {
    return isFreshRecord(await getRawMatchData(matchId), options);
  }

  async function getUserMatchPerspective(matchId, puuid) {
    const result = await pool.query(
      `select record from ${perspectivesTable} where match_id = $1 and puuid = $2`,
      [matchId, puuid]
    );
    return result.rows[0]?.record ?? null;
  }

  async function saveUserMatchPerspective(record, { now = new Date() } = {}) {
    const existing = await getUserMatchPerspective(record.matchId, record.puuid);
    const timestamp = now.toISOString();
    const nextRecord = {
      ...existing,
      ...record,
      createdAt: existing?.createdAt ?? record.createdAt ?? timestamp,
      updatedAt: timestamp
    };

    await pool.query(
      `
        insert into ${perspectivesTable} (match_id, puuid, record, created_at, updated_at)
        values ($1, $2, $3::jsonb, $4::timestamptz, $5::timestamptz)
        on conflict (match_id, puuid) do update
        set record = excluded.record,
            updated_at = excluded.updated_at
      `,
      [
        nextRecord.matchId,
        nextRecord.puuid,
        JSON.stringify(nextRecord),
        nextRecord.createdAt,
        nextRecord.updatedAt
      ]
    );

    return nextRecord;
  }

  async function listRecentGameCardsForUser({ puuid, matchIds = null, limit = 10 }) {
    const safeLimit = Number.isInteger(limit) && limit > 0 ? Math.min(limit, 100) : 10;
    const ids = Array.isArray(matchIds) && matchIds.length > 0 ? matchIds : null;
    const result = await pool.query(
      `
        select match_id, puuid, record, updated_at
        from ${perspectivesTable}
        where puuid = $1
          and ($2::text[] is null or match_id = any($2::text[]))
        order by
          case when $2::text[] is null then null else array_position($2::text[], match_id) end asc,
          updated_at desc
        limit $3
      `,
      [puuid, ids, safeLimit]
    );
    return result.rows.map(rowToRecentGameCard).filter(Boolean);
  }

  return {
    initialize,
    getRawMatchData,
    saveRawMatchData,
    hasFreshRawMatchData,
    getUserMatchPerspective,
    saveUserMatchPerspective,
    listRecentGameCardsForUser
  };
}
