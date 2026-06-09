import { fileURLToPath } from "node:url";

import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { assertDatabaseReachable, createDatabasePool } from "./db/pool.js";
import { runMigrations } from "./db/migrations.js";
import { createPreviewService } from "./previews.js";
import { createContentItemsRepository } from "./repositories/content-items.js";
import { createGoalTypesRepository } from "./repositories/goal-types.js";
import { createRiotMatchesRepository } from "./repositories/riot-matches.js";
import { createUserHomesRepository } from "./repositories/user-homes.js";
import { createPostgresAssetStore } from "./storage/postgres-assets.js";
import { seedSystemGoalTypes } from "./goal-types/system-goal-types.js";

export async function startServer(env = process.env) {
  const config = loadConfig(env);
  const pool = createDatabasePool({ databaseUrl: config.databaseUrl });
  await assertDatabaseReachable(pool);
  await runMigrations({ pool, schema: config.databaseSchema });

  const repositoryOptions = {
    pool,
    schema: config.databaseSchema
  };
  const contentItemsRepository = createContentItemsRepository({
    ...repositoryOptions
  });
  const goalTypesRepository = createGoalTypesRepository(repositoryOptions);
  const userHomesRepository = createUserHomesRepository(repositoryOptions);
  const riotMatchesRepository = createRiotMatchesRepository(repositoryOptions);
  const assetStore = createPostgresAssetStore(repositoryOptions);
  const previewService = createPreviewService();

  await contentItemsRepository.initialize();
  await goalTypesRepository.initialize();
  await seedSystemGoalTypes(goalTypesRepository);
  await userHomesRepository.initialize();
  await riotMatchesRepository.initialize();
  await assetStore.initialize();

  const app = createApp({
    config,
    contentItemsRepository,
    goalTypesRepository,
    userHomesRepository,
    riotMatchesRepository,
    assetStore,
    previewService
  });

  const server = app.listen(config.port, () => {
    console.log(`RiftSense listening on port ${config.port} (${config.nodeEnv})`);
  });

  server.on("close", () => {
    void pool.end();
  });

  return {
    app,
    server,
    config,
    pool
  };
}

const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isDirectRun) {
  void startServer();
}
