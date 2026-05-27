import { InlineKeyboard } from "grammy";
import type { SafeCreationSession } from "../domain/types.js";

export function mainMenuKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("Create group Safe", "help:safe_group")
    .text("Link wallet", "help:link")
    .row()
    .text("Buy token", "help:buy")
    .text("Launch Flap", "help:flap");
}

export function safeGroupKeyboard(session: SafeCreationSession): InlineKeyboard {
  const keyboard = new InlineKeyboard().text("Join as owner", `safe_join:${session.id}`).text("Refresh", `safe_refresh:${session.id}`);
  if (session.owners.length >= session.threshold && session.status === "collecting") {
    keyboard.row().text("Deploy Safe", `safe_deploy:${session.id}`);
  }
  return keyboard;
}

export function helpText(topic: string): string {
  if (topic === "safe_group") {
    return [
      "Group Safe setup",
      "1. Each owner links a wallet with /link_start and /link_submit.",
      "2. A group admin runs /safe_group <threshold>.",
      "3. Members tap Join as owner.",
      "4. A group admin taps Deploy Safe."
    ].join("\n");
  }
  if (topic === "link") {
    return ["Link wallet", "/link_start <ownerAddress>", "/link_submit <ownerAddress> <signature>"].join("\n");
  }
  if (topic === "buy") {
    return ["Buy token", "/buy <tokenAddress> <bnbAmount> [slippageBps]", "Example: /buy 0x... 0.05 150"].join("\n");
  }
  if (topic === "flap") {
    return [
      "Flap launch",
      "/flap_metadata is optional when using Pinata.",
      "/flap_launch <name>|<symbol>|<metadataUri>|<buyTaxBps>|<sellTaxBps>|<taxDays>|<recipient:bps,...>|<initialBuyBnb>"
    ].join("\n");
  }
  return "Unknown help topic";
}
