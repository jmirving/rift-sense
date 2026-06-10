import { quoteIdentifier } from "../db/migrations.js";

function evaluationsTableName(schema) {
  return `${quoteIdentifier(schema)}.match_evaluations`;
}

function rawTableName(schema) {
  return `${quoteIdentifier(schema)}.riot_raw_matches`;
}

function perspectivesTableName(schema) {
  return `${quoteIdentifier(schema)}.riot_match_perspectives`;
}

function toIso(value) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function nullableIso(value) {
  return value ? toIso(value) : null;
}

function rowToEvaluation(row) {
  if (!row) {
    return null;
  }

  return {
    matchId: row.match_id,
    puuid: row.puuid,
    evaluationVersion: row.evaluation_version,
    sourceRawMatchUpdatedAt: nullableIso(row.source_raw_match_updated_at),
    sourcePerspectiveUpdatedAt: nullableIso(row.source_perspective_updated_at),
    summaryJson: row.summary_json,
    deathsJson: row.deaths_json,
    tagsJson: row.tags_json,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at)
  };
}

function summaryFromEvaluationRow(row) {
  if (!row) {
    return null;
  }

  const summaryJson = row.summary_json ?? {};
  const tagsJson = row.tags_json ?? {};
  const counts = tagsJson.counts ?? tagsJson.deathTagCounts ?? {};
  const topTags = Object.entries(counts)
    .filter(([tag]) => tag !== "death_count")
    .map(([tag, count]) => ({ tag, count: Number(count) }))
    .filter((entry) => Number.isFinite(entry.count) && entry.count > 0)
    .sort((left, right) => right.count - left.count)
    .slice(0, 5);
  const deathCount = Number(counts.death_count ?? summaryJson.deathCount ?? 0);
  const reviewSignals = [
    `${Number.isFinite(deathCount) ? deathCount : 0} ${deathCount === 1 ? "death" : "deaths"}`,
    ...topTags.map((entry) => `${entry.count} ${entry.tag.replaceAll("_", " ")}`)
  ];

  return {
    matchId: row.match_id,
    puuid: row.puuid,
    evaluationVersion: row.evaluation_version,
    evaluationStatus: "current",
    evaluationSummary: {
      deathCount: Number.isFinite(deathCount) ? deathCount : 0,
      topTags,
      reviewSignals,
      evaluatedAt: summaryJson.evaluatedAt ?? nullableIso(row.updated_at)
    },
    updatedAt: toIso(row.updated_at)
  };
}

function rowToPersistedInput(row) {
  if (!row) {
    return null;
  }

  return {
    matchId: row.match_id,
    puuid: row.puuid,
    summaryJson: row.summary_json,
    timelineJson: row.timeline_json,
    perspectiveRecord: row.perspective_record,
    sourceRawMatchUpdatedAt: nullableIso(row.raw_updated_at),
    sourcePerspectiveUpdatedAt: nullableIso(row.perspective_updated_at)
  };
}

function rowToRecentPerspectiveInput(row) {
  if (!row) {
    return null;
  }

  return {
    matchId: row.match_id,
    puuid: row.puuid,
    summaryJson: row.summary_json,
    timelineJson: row.timeline_json,
    perspectiveRecord: row.perspective_record,
    sourceRawMatchUpdatedAt: nullableIso(row.raw_updated_at),
    sourcePerspectiveUpdatedAt: nullableIso(row.perspective_updated_at),
    rawMatchMissing: !row.raw_updated_at
  };
}

function rowToMatchReview(row) {
  if (!row) {
    return null;
  }

  const evaluation = row.evaluation_version
    ? rowToEvaluation({
        match_id: row.match_id,
        puuid: row.puuid,
        evaluation_version: row.evaluation_version,
        source_raw_match_updated_at: row.source_raw_match_updated_at,
        source_perspective_updated_at: row.source_perspective_updated_at,
        summary_json: row.summary_json,
        deaths_json: row.deaths_json,
        tags_json: row.tags_json,
        created_at: row.evaluation_created_at,
        updated_at: row.evaluation_updated_at
      })
    : null;

  return {
    matchId: row.match_id,
    puuid: row.puuid,
    perspectiveRecord: row.perspective_record,
    sourcePerspectiveUpdatedAt: nullableIso(row.perspective_updated_at),
    evaluation
  };
}

export function createMatchEvaluationsRepository({ pool, schema = "riftsense" }) {
  const evaluationsTable = evaluationsTableName(schema);
  const rawTable = rawTableName(schema);
  const perspectivesTable = perspectivesTableName(schema);

  async function initialize() {
    await pool.query(`select 1 from ${evaluationsTable} limit 1`);
  }

  async function getMatchEvaluation({ matchId, puuid, evaluationVersion }) {
    const result = await pool.query(
      `
        select *
        from ${evaluationsTable}
        where match_id = $1 and puuid = $2 and evaluation_version = $3
      `,
      [matchId, puuid, evaluationVersion]
    );
    return rowToEvaluation(result.rows[0]);
  }

  async function saveMatchEvaluation(record, { now = new Date() } = {}) {
    const timestamp = now.toISOString();
    const result = await pool.query(
      `
        insert into ${evaluationsTable} (
          match_id,
          puuid,
          evaluation_version,
          source_raw_match_updated_at,
          source_perspective_updated_at,
          summary_json,
          deaths_json,
          tags_json,
          created_at,
          updated_at
        )
        values ($1, $2, $3, $4::timestamptz, $5::timestamptz, $6::jsonb, $7::jsonb, $8::jsonb, $9::timestamptz, $9::timestamptz)
        on conflict (match_id, puuid, evaluation_version) do update
        set source_raw_match_updated_at = excluded.source_raw_match_updated_at,
            source_perspective_updated_at = excluded.source_perspective_updated_at,
            summary_json = excluded.summary_json,
            deaths_json = excluded.deaths_json,
            tags_json = excluded.tags_json,
            updated_at = excluded.updated_at
        returning *
      `,
      [
        record.matchId,
        record.puuid,
        record.evaluationVersion,
        record.sourceRawMatchUpdatedAt,
        record.sourcePerspectiveUpdatedAt,
        JSON.stringify(record.summaryJson),
        JSON.stringify(record.deathsJson),
        JSON.stringify(record.tagsJson),
        timestamp
      ]
    );
    return rowToEvaluation(result.rows[0]);
  }

  async function getPersistedMatchInput({ matchId, puuid }) {
    const result = await pool.query(
      `
        select
          raw.match_id,
          perspectives.puuid,
          raw.summary_json,
          raw.timeline_json,
          perspectives.record as perspective_record,
          raw.updated_at as raw_updated_at,
          perspectives.updated_at as perspective_updated_at
        from ${rawTable} raw
        join ${perspectivesTable} perspectives
          on perspectives.match_id = raw.match_id
        where raw.match_id = $1 and perspectives.puuid = $2
      `,
      [matchId, puuid]
    );
    return rowToPersistedInput(result.rows[0]);
  }

  async function listRecentPersistedMatchInputsForUser({ puuid, limit = 10 }) {
    const safeLimit = Number.isInteger(limit) && limit > 0 ? Math.min(limit, 100) : 10;
    const result = await pool.query(
      `
        select
          raw.match_id,
          perspectives.puuid,
          raw.summary_json,
          raw.timeline_json,
          perspectives.record as perspective_record,
          raw.updated_at as raw_updated_at,
          perspectives.updated_at as perspective_updated_at
        from ${perspectivesTable} perspectives
        join ${rawTable} raw
          on raw.match_id = perspectives.match_id
        where perspectives.puuid = $1
        order by perspectives.updated_at desc
        limit $2
      `,
      [puuid, safeLimit]
    );
    return result.rows.map(rowToPersistedInput);
  }

  async function listRecentPersistedPerspectivesForUser({ puuid, limit = 10 }) {
    const safeLimit = Number.isInteger(limit) && limit > 0 ? Math.min(limit, 100) : 10;
    const result = await pool.query(
      `
        select
          perspectives.match_id,
          perspectives.puuid,
          raw.summary_json,
          raw.timeline_json,
          perspectives.record as perspective_record,
          raw.updated_at as raw_updated_at,
          perspectives.updated_at as perspective_updated_at
        from ${perspectivesTable} perspectives
        left join ${rawTable} raw
          on raw.match_id = perspectives.match_id
        where perspectives.puuid = $1
        order by perspectives.updated_at desc
        limit $2
      `,
      [puuid, safeLimit]
    );
    return result.rows.map(rowToRecentPerspectiveInput);
  }

  async function listRecentEvaluationSummariesForUser({
    puuid,
    evaluationVersion,
    matchIds = null,
    limit = 10
  }) {
    const safeLimit = Number.isInteger(limit) && limit > 0 ? Math.min(limit, 100) : 10;
    const ids = Array.isArray(matchIds) && matchIds.length > 0 ? matchIds : null;
    const result = await pool.query(
      `
        select match_id, puuid, evaluation_version, summary_json, tags_json, updated_at
        from ${evaluationsTable}
        where puuid = $1
          and evaluation_version = $2
          and ($3::text[] is null or match_id = any($3::text[]))
        order by
          case when $3::text[] is null then null else array_position($3::text[], match_id) end asc,
          updated_at desc
        limit $4
      `,
      [puuid, evaluationVersion, ids, safeLimit]
    );
    return result.rows.map(summaryFromEvaluationRow).filter(Boolean);
  }

  async function getPersistedMatchReview({ matchId, puuid, evaluationVersion }) {
    const result = await pool.query(
      `
        select
          perspectives.match_id,
          perspectives.puuid,
          perspectives.record as perspective_record,
          perspectives.updated_at as perspective_updated_at,
          evaluations.evaluation_version,
          evaluations.source_raw_match_updated_at,
          evaluations.source_perspective_updated_at,
          evaluations.summary_json,
          evaluations.deaths_json,
          evaluations.tags_json,
          evaluations.created_at as evaluation_created_at,
          evaluations.updated_at as evaluation_updated_at
        from ${perspectivesTable} perspectives
        left join ${evaluationsTable} evaluations
          on evaluations.match_id = perspectives.match_id
         and evaluations.puuid = perspectives.puuid
         and evaluations.evaluation_version = $3
        where perspectives.match_id = $1 and perspectives.puuid = $2
      `,
      [matchId, puuid, evaluationVersion]
    );
    return rowToMatchReview(result.rows[0]);
  }

  return {
    initialize,
    getMatchEvaluation,
    saveMatchEvaluation,
    getPersistedMatchInput,
    listRecentPersistedMatchInputsForUser,
    listRecentPersistedPerspectivesForUser,
    listRecentEvaluationSummariesForUser,
    getPersistedMatchReview
  };
}
