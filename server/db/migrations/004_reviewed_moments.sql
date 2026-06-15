create table if not exists __RIFTSENSE_SCHEMA__.reviewed_moments (
  user_id text not null,
  match_id text not null,
  puuid text not null,
  death_index integer not null,
  death_timestamp_seconds integer,
  signal_id text not null,
  status text not null check (status in ('confirmed', 'dismissed', 'unsure')),
  cause_category text check (
    cause_category is null or cause_category in (
      'walked_without_cover',
      'outnumbered_fight',
      'stayed_too_long',
      'objective_setup_mistake',
      'mechanics_misplay',
      'team_fight_already_lost',
      'not_preventable',
      'other'
    )
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, match_id, death_index, signal_id)
);

create index if not exists reviewed_moments_user_status_idx
  on __RIFTSENSE_SCHEMA__.reviewed_moments (user_id, status, updated_at desc);
create index if not exists reviewed_moments_match_user_idx
  on __RIFTSENSE_SCHEMA__.reviewed_moments (match_id, user_id);
