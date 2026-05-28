import { InlineKeyboard } from "grammy";
import type { SafeCreationSession } from "../domain/types.js";

export function mainMenuKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("Generate wallet", "menu:wallet_generate")
    .text("Link wallet", "menu:link_start")
    .row()
    .text("Create group Safe", "menu:safe_group")
    .text("Show Safe", "menu:wallet")
    .row()
    .text("Init pool", "menu:pool_init")
    .text("Pool analytics", "menu:pool")
    .row()
    .text("Deposit", "menu:pool_deposit")
    .text("Withdraw", "menu:pool_withdraw")
    .row()
    .text("Cancel withdrawal", "menu:pool_cancel")
    .text("Unlink Safe", "menu:safe_unlink")
    .row()
    .text("Set role", "menu:pool_role")
    .text("Update NAV", "menu:pool_nav")
    .row()
    .text("Buy token", "menu:buy")
    .text("Show proposal", "menu:proposal")
    .row()
    .text("Prepare Safe tx", "menu:safe_prepare")
    .text("Safe tx status", "menu:safe_status")
    .row()
    .text("Execute Safe tx", "menu:safe_execute")
    .row()
    .text("Flap metadata", "menu:flap_metadata")
    .text("Launch Flap", "menu:flap_launch");
}

export function promptStepKeyboard(showBack: boolean): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  if (showBack) {
    keyboard.text("Back", "prompt_back");
  }
  keyboard.text("Cancel", "prompt_cancel");
  return keyboard;
}

export function safeGroupKeyboard(session: SafeCreationSession): InlineKeyboard {
  const keyboard = new InlineKeyboard()
    .text("Generate wallet + join", `generate_join:${session.id}`)
    .text("Join linked wallet", `safe_join:${session.id}`)
    .row()
    .text("Refresh", `safe_refresh:${session.id}`);
  if (session.owners.length >= session.threshold && session.status === "collecting") {
    keyboard.row().text("Deploy Safe", `safe_deploy:${session.id}`);
  }
  if (session.status === "collecting") {
    keyboard.row().text("Cancel setup", `safe_cancel:${session.id}`);
  }
  return keyboard;
}

export function confirmUnlinkKeyboard(): InlineKeyboard {
  return new InlineKeyboard().text("Confirm unlink", "safe_unlink_confirm");
}

export function safeSubmissionKeyboard(submissionId: string, publicBaseUrl?: string): InlineKeyboard {
  const base = publicBaseUrl?.replace(/\/$/, "") ?? "http://localhost:3000";
  const url = `${base}/sign/${encodeURIComponent(submissionId)}`;
  return new InlineKeyboard().url("Open signing page", url);
}

export function poolAppKeyboard(chatId: string, publicBaseUrl?: string): InlineKeyboard {
  const url = `${publicBaseUrl?.replace(/\/$/, "") ?? "http://localhost:3000"}/pool/${encodeURIComponent(chatId)}`;
  return new InlineKeyboard().webApp("Open analytics", url).url("Open in browser", url);
}

export function helpText(topic: string): string {
  if (topic === "safe_group") {
    return [
      "Group Safe setup",
      "1. Each owner taps Generate + join or links a wallet with /link_start and /link_submit.",
      "2. A group admin runs /safe_group <threshold>.",
      "3. Members join from the inline buttons.",
      "4. A group admin taps Deploy Safe."
    ].join("\n");
  }
  if (topic === "link") {
    return [
      "Wallets",
      "/wallet_generate (DM me — generates a non-custodial wallet, key shown once)",
      "/link_start <ownerAddress>",
      "/link_submit <ownerAddress> <signature>"
    ].join("\n");
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
  if (topic === "pool") {
    return [
      "Pool",
      "/pool_init",
      "/pool_nav <navBnb> <liquidBnb> <positionsBnb>",
      "/pool_role <telegramUserId> <owner|trader|member>",
      "/pool_deposit <bnbAmount> <txHash>",
      "/pool_withdraw <basisPoints> <recipientAddress>"
    ].join("\n");
  }
  return "Unknown help topic";
}
