create table if not exists __RIFTSENSE_SCHEMA__.match_evaluations (
  match_id text not null,
  puuid text not null,
  evaluation_version text not null,
  source_raw_match_updated_at timestamptz,
  source_perspective_updated_at timestamptz,
  summary_json jsonb not null,
  deaths_json jsonb not null,
  tags_json jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (match_id, puuid, evaluation_version)
);

create index if not exists match_evaluations_puuid_updated_at_idx
  on __RIFTSENSE_SCHEMA__.match_evaluations (puuid, updated_at desc);
create index if not exists match_evaluations_match_id_idx
  on __RIFTSENSE_SCHEMA__.match_evaluations (match_id);
create index if not exists match_evaluations_evaluation_version_idx
  on __RIFTSENSE_SCHEMA__.match_evaluations (evaluation_version);
