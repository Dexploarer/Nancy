import { loadConfig } from "./config.js";
import { buildApp } from "./app.js";
import { Logger } from "./logger.js";
import { startHttpRuntime } from "./http/server.js";

const config = loadConfig();
const app = buildApp(config);

Logger.info("[Bootstrap] Starting Telegram bot", {
  appEnv: config.appEnv,
  storageDriver: config.storageDriver,
  bscChainId: config.bscChainId
});

await startHttpRuntime(app, config);
