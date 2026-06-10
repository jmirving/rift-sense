create index if not exists riot_match_perspectives_puuid_updated_at_idx
  on __RIFTSENSE_SCHEMA__.riot_match_perspectives (puuid, updated_at desc);
