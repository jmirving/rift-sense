create schema if not exists __RIFTSENSE_SCHEMA__;

create table if not exists __RIFTSENSE_SCHEMA__.schema_migrations (
  id text primary key,
  applied_at timestamptz not null default now()
);

create table if not exists __RIFTSENSE_SCHEMA__.content_items (
  id text primary key,
  record jsonb not null,
  status text generated always as (record ->> 'status') stored,
  content_type text generated always as (record ->> 'contentType') stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists content_items_status_idx on __RIFTSENSE_SCHEMA__.content_items (status);
create index if not exists content_items_content_type_idx on __RIFTSENSE_SCHEMA__.content_items (content_type);
create index if not exists content_items_updated_at_idx on __RIFTSENSE_SCHEMA__.content_items (updated_at desc);
create index if not exists content_items_topic_tags_idx on __RIFTSENSE_SCHEMA__.content_items using gin ((record -> 'topicTags'));

create table if not exists __RIFTSENSE_SCHEMA__.goal_types (
  id text primary key,
  record jsonb not null,
  is_active_option boolean generated always as (((record ->> 'isActiveOption')::boolean)) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists goal_types_active_option_idx on __RIFTSENSE_SCHEMA__.goal_types (is_active_option);
create index if not exists goal_types_updated_at_idx on __RIFTSENSE_SCHEMA__.goal_types (updated_at desc);

create table if not exists __RIFTSENSE_SCHEMA__.user_homes (
  user_id text primary key,
  record jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists user_homes_updated_at_idx on __RIFTSENSE_SCHEMA__.user_homes (updated_at desc);

create table if not exists __RIFTSENSE_SCHEMA__.riot_raw_matches (
  match_id text primary key,
  summary_json jsonb not null,
  timeline_json jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists riot_raw_matches_updated_at_idx on __RIFTSENSE_SCHEMA__.riot_raw_matches (updated_at desc);

create table if not exists __RIFTSENSE_SCHEMA__.riot_match_perspectives (
  match_id text not null,
  puuid text not null,
  record jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (match_id, puuid)
);

create index if not exists riot_match_perspectives_puuid_idx on __RIFTSENSE_SCHEMA__.riot_match_perspectives (puuid);
create index if not exists riot_match_perspectives_updated_at_idx on __RIFTSENSE_SCHEMA__.riot_match_perspectives (updated_at desc);

create table if not exists __RIFTSENSE_SCHEMA__.assets (
  content_id text primary key,
  original_filename text not null,
  mime_type text not null,
  size_bytes integer not null,
  bytes bytea not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists assets_updated_at_idx on __RIFTSENSE_SCHEMA__.assets (updated_at desc);
