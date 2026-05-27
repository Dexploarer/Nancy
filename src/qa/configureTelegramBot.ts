import { Bot } from "grammy";
import { loadConfig } from "../config.js";
import { Logger } from "../logger.js";
import { BOT_COMMANDS, configureTelegramBot } from "../bot/telegramCommands.js";

const config = loadConfig();
const bot = new Bot(config.telegramBotToken);

await configureTelegramBot(bot);
const me = await bot.api.getMe();
const commands = await bot.api.getMyCommands();

Logger.info("[TelegramSetup] Bot commands configured", {
  username: me.username,
  commandCount: commands.length,
  expectedCommandCount: BOT_COMMANDS.length
});
