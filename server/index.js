import { fileURLToPath } from "node:url";

import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { createPreviewService } from "./previews.js";
import { createContentItemsRepository } from "./repositories/content-items.js";
import { createGoalTypesRepository } from "./repositories/goal-types.js";
import { createRiotMatchesRepository } from "./repositories/riot-matches.js";
import { createUserHomesRepository } from "./repositories/user-homes.js";
import { createLocalAssetStore } from "./storage/local-assets.js";
import { seedSystemGoalTypes } from "./goal-types/system-goal-types.js";

export async function startServer(env = process.env) {
  const config = loadConfig(env);
  const contentItemsRepository = createContentItemsRepository({
    contentItemsDir: config.contentItemsDir
  });
  const goalTypesRepository = createGoalTypesRepository({
    goalTypesDir: config.goalTypesDir
  });
  const userHomesRepository = createUserHomesRepository({
    userHomesDir: config.userHomesDir
  });
  const riotMatchesRepository = createRiotMatchesRepository({
    rawMatchesDir: config.riotRawMatchesDir,
    perspectivesDir: config.riotMatchPerspectivesDir
  });
  const assetStore = createLocalAssetStore({
    assetsDir: config.assetsDir
  });
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

  return {
    app,
    server,
    config
  };
}

const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isDirectRun) {
  void startServer();
}
