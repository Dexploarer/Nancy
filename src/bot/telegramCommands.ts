import type { Bot } from "grammy";

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
  { command: "buy", description: "Create a BSC token buy proposal" },
  { command: "proposal", description: "Show a trade proposal" },
  { command: "flap_metadata", description: "Upload optional Flap metadata" },
  { command: "flap_launch", description: "Create a Flap launch proposal" },
  { command: "safe_prepare", description: "Prepare a Safe transaction" },
  { command: "safe_status", description: "Show Safe transaction status" },
  { command: "safe_execute", description: "Execute a ready Safe transaction" }
] as const;

export async function configureTelegramBot(bot: Bot): Promise<void> {
  await bot.api.setMyCommands([...BOT_COMMANDS]);
  await bot.api.setChatMenuButton({ menu_button: { type: "commands" } });
}
