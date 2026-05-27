import { loadConfig } from "./config.js";
import { buildApp } from "./app.js";
import { Logger } from "./logger.js";

const config = loadConfig();
const bot = buildApp(config);

Logger.info("[Bootstrap] Starting Telegram bot", {
  appEnv: config.appEnv,
  storageDriver: config.storageDriver,
  bscChainId: config.bscChainId
});

await bot.start();
