import type { Bot } from "grammy";

export const BOT_NAME = "Nancy, the Golden Girl of Binance";

export const BOT_SHORT_DESCRIPTION = "BSC Safe group trading, pool accounting, and Flap launches for Telegram groups.";

export const BOT_DESCRIPTION = [
  "Nancy, the Golden Girl of Binance, helps Telegram groups run BSC Safe trading pools.",
  "Create or link a group Safe, assign owners/traders/members, verify deposits, track shares and PnL, prepare token buys, launch through Flap, and approve Safe transactions.",
  "Nancy is infrastructure only. No profit, token, or execution guarantees."
].join("\n");

export const BOT_COMMANDS = [
  { command: "start", description: "Open the group trading menu" },
  { command: "wallet_generate", description: "Create a bot-managed owner wallet" },
  { command: "wallet_managed", description: "Show your bot-managed owner wallet" },
  { command: "link_start", description: "Start wallet linking" },
  { command: "link_submit", description: "Submit wallet link signature" },
  { command: "safe_group", description: "Collect group members and deploy a Safe" },
  { command: "safe_group_join", description: "Join a Safe setup with a specific wallet" },
  { command: "safe_create", description: "Deploy a Safe from explicit owner addresses" },
  { command: "wallet_set", description: "Link an existing Safe to this group" },
  { command: "wallet", description: "Show the group Safe wallet" },
  { command: "pool_init", description: "Initialize group pool accounting" },
  { command: "pool", description: "Show pool analytics mini app" },
  { command: "pool_nav", description: "Update pool NAV snapshot" },
  { command: "pool_role", description: "Assign pool owner/trader/member role" },
  { command: "pool_deposit", description: "Credit a verified BNB deposit" },
  { command: "pool_withdraw", description: "Request a pool withdrawal" },
  { command: "buy", description: "Create a BSC token buy proposal" },
  { command: "proposal", description: "Show a trade proposal" },
  { command: "flap_metadata", description: "Upload optional Flap metadata" },
  { command: "flap_launch", description: "Create a Flap launch proposal" },
  { command: "safe_prepare", description: "Prepare a Safe transaction" },
  { command: "safe_status", description: "Show Safe transaction status" },
  { command: "safe_execute", description: "Execute a ready Safe transaction" }
] as const;

export async function configureTelegramBot(bot: Bot): Promise<void> {
  await bot.api.setMyName(BOT_NAME);
  await bot.api.setMyDescription(BOT_DESCRIPTION);
  await bot.api.setMyShortDescription(BOT_SHORT_DESCRIPTION);
  await bot.api.setMyCommands([...BOT_COMMANDS]);
  await bot.api.setChatMenuButton({ menu_button: { type: "commands" } });
}
