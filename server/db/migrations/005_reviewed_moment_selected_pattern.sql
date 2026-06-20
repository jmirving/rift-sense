alter table __RIFTSENSE_SCHEMA__.reviewed_moments
  add column if not exists selected_pattern_id text;
