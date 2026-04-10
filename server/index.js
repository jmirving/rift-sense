import { fileURLToPath } from "node:url";

import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { createPreviewService } from "./previews.js";
import { createContentItemsRepository } from "./repositories/content-items.js";
import { createUserHomesRepository } from "./repositories/user-homes.js";
import { createLocalAssetStore } from "./storage/local-assets.js";

export async function startServer(env = process.env) {
  const config = loadConfig(env);
  const contentItemsRepository = createContentItemsRepository({
    contentItemsDir: config.contentItemsDir
  });
  const userHomesRepository = createUserHomesRepository({
    userHomesDir: config.userHomesDir
  });
  const assetStore = createLocalAssetStore({
    assetsDir: config.assetsDir
  });
  const previewService = createPreviewService();

  await contentItemsRepository.initialize();
  await userHomesRepository.initialize();
  await assetStore.initialize();

  const app = createApp({
    config,
    contentItemsRepository,
    userHomesRepository,
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
