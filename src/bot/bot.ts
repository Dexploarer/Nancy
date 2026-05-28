import { Bot, type Context } from "grammy";
import type { AppConfig } from "../config.js";
import { AppError, InvalidInputError, UserInputError } from "../domain/errors.js";
import type { Repository } from "../storage/repository.js";
import { parseAddress, parseBasisPoints, parseBnbAmount, parseHex } from "../utils/evm.js";
import { Logger } from "../logger.js";
import { createFlapSalt, parseVaultRecipients } from "../chain/flapService.js";
import {
  formatFlapLaunch,
  formatGeneratedWallet,
  formatSafeDeployment,
  formatSafeCreationSession,
  formatSafeStatus,
  formatSafeSubmission,
  formatTradeProposal,
  formatWallet
} from "./formatters.js";
import { GroupWalletService } from "../services/groupWalletService.js";
import { TradeService } from "../services/tradeService.js";
import { FlapLaunchService } from "../services/flapLaunchService.js";
import { SafeSubmissionService } from "../services/safeSubmissionService.js";
import { WalletLinkService } from "../services/walletLinkService.js";
import { FlapMetadataService } from "../services/flapMetadataService.js";
import { SafeDeploymentService } from "../services/safeDeploymentService.js";
import { SafeGroupSetupService } from "../services/safeGroupSetupService.js";
import { PoolService } from "../services/poolService.js";
import { DepositVerificationService } from "../services/depositVerificationService.js";
import { flapLaunchKeyboard, helpText, linkPageKeyboard, mainMenuKeyboard, safeGroupKeyboard, safeSubmissionKeyboard, tradeProposalKeyboard } from "./keyboards.js";
import { registerSafeCallbacks } from "./safeCallbacks.js";
import { registerPoolCommands } from "./poolCommands.js";
import { beginUnlink, handleMenuSelection, handlePromptBack, handlePromptCancel, handlePromptChoice, routePromptInput } from "./promptController.js";
import {
  emptyToUndefined,
  handleUserCommand,
  parsePositiveInteger,
  requireChatId,
  requireGroupAdmin,
  requiredPart,
  requireTelegramUserId,
  splitCommand
} from "./commandUtils.js";

export type BotDependencies = {
  repository: Repository;
  groupWalletService: GroupWalletService;
  walletLinkService: WalletLinkService;
  tradeService: TradeService;
  flapLaunchService: FlapLaunchService;
  flapMetadataService: FlapMetadataService;
  safeSubmissionService: SafeSubmissionService;
  safeDeploymentService: SafeDeploymentService;
  safeGroupSetupService: SafeGroupSetupService;
  poolService: PoolService;
  depositVerificationService: DepositVerificationService;
  config: AppConfig;
};

export function createBot(dependencies: BotDependencies): Bot {
  const bot = new Bot(dependencies.config.telegramBotToken);

  bot.command("start", async (ctx) => {
    await ctx.reply(
      [
        "💛 Hey sugar — Nancy here, the Golden Girl of Binance.",
        "",
        "I run your group's shared trading wallet: a Safe multisig the owners control. I never hold your keys.",
        "",
        "New here? Three taps to get going:",
        "1️⃣ Generate wallet (or Link wallet) — your owner key",
        "2️⃣ Create group Safe — collect owners, then deploy from your wallet",
        "3️⃣ Init pool — then Deposit and watch your share grow",
        "",
        "Tap a button below, or open the command menu (the / icon) for everything."
      ].join("\n"),
      { reply_markup: mainMenuKeyboard() }
    );
  });

  bot.command("wallet_generate", async (ctx) => {
    await handleUserCommand(ctx, "wallet_generate", async () => {
      const fromId = requireTelegramUserId(ctx.from?.id);
      if (ctx.chat?.type !== "private") {
        await ctx.reply(
          "DM me to generate a wallet so your private key stays private. Open a private chat with me and run /wallet_generate there."
        );
        return;
      }
      const generated = await dependencies.walletLinkService.generateLinkedWallet(fromId);
      await ctx.reply(formatGeneratedWallet(generated));
    });
  });

  bot.command("link_start", async (ctx) => {
    await handleUserCommand(ctx, "link_start", async () => {
      const fromId = requireTelegramUserId(ctx.from?.id);
      const parts = splitCommand(ctx.message?.text, 2);
      const address = parseAddress(requiredPart(parts, 1));
      const result = await dependencies.walletLinkService.beginLink(fromId, address);
      await ctx.reply(
        [
          "Tap below, connect this wallet, and sign.",
          "",
          "Manual fallback: sign this message and run /link_submit <ownerAddress> <signature>",
          result.message
        ].join("\n"),
        { reply_markup: linkPageKeyboard(result.link.nonce, dependencies.config.publicBaseUrl, ctx.chat?.type === "private") }
      );
    });
  });

  bot.command("link_submit", async (ctx) => {
    await handleUserCommand(ctx, "link_submit", async () => {
      const fromId = requireTelegramUserId(ctx.from?.id);
      const parts = splitCommand(ctx.message?.text, 3);
      const address = parseAddress(requiredPart(parts, 1));
      const signature = parseHex(requiredPart(parts, 2), "signature");
      const link = await dependencies.walletLinkService.completeLink(fromId, address, signature);
      await ctx.reply(`Linked wallet ${link.address}`);
    });
  });

  bot.command("wallet_set", async (ctx) => {
    await handleUserCommand(ctx, "wallet_set", async () => {
      const chatId = requireChatId(ctx.chat?.id);
      await requireGroupAdmin(ctx, chatId);
      const parts = splitCommand(ctx.message?.text, 4);
      const safeAddress = parseAddress(requiredPart(parts, 1));
      const threshold = parsePositiveInteger(requiredPart(parts, 2), "threshold");
      const owners = parts.slice(3).map(parseAddress);
      if (threshold > owners.length) {
        throw new UserInputError("Threshold cannot exceed owner count", { threshold, owners: owners.length });
      }
      const wallet = await dependencies.groupWalletService.setWallet(chatId, safeAddress, threshold, owners);
      await ctx.reply(formatWallet(wallet));
    });
  });

  bot.command("safe_create", async (ctx) => {
    await handleUserCommand(ctx, "safe_create", async () => {
      const chatId = requireChatId(ctx.chat?.id);
      await requireGroupAdmin(ctx, chatId);
      const parts = splitCommand(ctx.message?.text, 3);
      const threshold = parsePositiveInteger(requiredPart(parts, 1), "threshold");
      const owners = parts.slice(2).map(parseAddress);
      if (threshold > owners.length) {
        throw new UserInputError("Threshold cannot exceed owner count", { threshold, owners: owners.length });
      }
      const deployment = await dependencies.safeDeploymentService.createSafe({ owners, threshold });
      const wallet = await dependencies.groupWalletService.setWallet(chatId, deployment.safeAddress, threshold, owners);
      await ctx.reply([formatSafeDeployment(deployment), "", formatWallet(wallet)].join("\n"));
    });
  });

  bot.command("safe_group", async (ctx) => {
    await handleUserCommand(ctx, "safe_group", async () => {
      const chatId = requireChatId(ctx.chat?.id);
      await requireGroupAdmin(ctx, chatId);
      const fromId = requireTelegramUserId(ctx.from?.id);
      const parts = splitCommand(ctx.message?.text, 2);
      const threshold = parsePositiveInteger(requiredPart(parts, 1), "threshold");
      const session = await dependencies.safeGroupSetupService.createSession(chatId, fromId, threshold);
      await ctx.reply(formatSafeCreationSession(session), {
        reply_markup: safeGroupKeyboard(session)
      });
    });
  });

  bot.command("safe_group_join", async (ctx) => {
    await handleUserCommand(ctx, "safe_group_join", async () => {
      const fromId = requireTelegramUserId(ctx.from?.id);
      const parts = splitCommand(ctx.message?.text, 3);
      const session = await dependencies.safeGroupSetupService.joinWithWallet(
        requiredPart(parts, 1),
        fromId,
        parseAddress(requiredPart(parts, 2))
      );
      await ctx.reply(formatSafeCreationSession(session), {
        reply_markup: safeGroupKeyboard(session)
      });
    });
  });

  bot.command("wallet", async (ctx) => {
    await handleUserCommand(ctx, "wallet", async () => {
      const chatId = requireChatId(ctx.chat?.id);
      const wallet = await dependencies.groupWalletService.getWallet(chatId);
      if (wallet === null) {
        throw new UserInputError("No group wallet set");
      }
      await ctx.reply(formatWallet(wallet));
    });
  });

  bot.command("buy", async (ctx) => {
    await handleUserCommand(ctx, "buy", async () => {
      const chatId = requireChatId(ctx.chat?.id);
      const fromId = requireTelegramUserId(ctx.from?.id);
      await dependencies.poolService.requireTraderAccess(chatId, fromId);
      const parts = splitCommand(ctx.message?.text, 3);
      const tokenAddress = parseAddress(requiredPart(parts, 1));
      const amountWei = parseBnbAmount(requiredPart(parts, 2));
      const slippageBps = parts[3] === undefined ? 150 : parseBasisPoints(parts[3], 5000);
      const proposal = await dependencies.tradeService.createNativeBuyProposal({
        chatId,
        proposerTelegramId: fromId,
        tokenAddress,
        inputAmountWei: amountWei,
        slippageBps,
        tradeFeeBps: dependencies.config.tradeFeeBps,
        feeRecipient: dependencies.config.platformFeeRecipient,
        dexDeadlineSeconds: dependencies.config.dexDeadlineSeconds
      });
      await ctx.reply(formatTradeProposal(proposal), { reply_markup: tradeProposalKeyboard(proposal.id) });
    });
  });

  bot.command("proposal", async (ctx) => {
    await handleUserCommand(ctx, "proposal", async () => {
      const parts = splitCommand(ctx.message?.text, 2);
      const proposalId = requiredPart(parts, 1);
      const proposal = await dependencies.tradeService.getProposal(proposalId);
      if (proposal === null) {
        throw new UserInputError("Proposal not found", { id: proposalId });
      }
      await ctx.reply(formatTradeProposal(proposal), { reply_markup: tradeProposalKeyboard(proposal.id) });
    });
  });

  bot.command("flap_launch", async (ctx) => {
    await handleUserCommand(ctx, "flap_launch", async () => {
      const chatId = requireChatId(ctx.chat?.id);
      await requireGroupAdmin(ctx, chatId);
      const fromId = requireTelegramUserId(ctx.from?.id);
      const commandText = ctx.message?.text;
      if (commandText === undefined) {
        throw new InvalidInputError();
      }
      const payload = commandText.replace(/^\/flap_launch(@\w+)?\s*/, "");
      const parts = payload.split("|");
      if (parts.length !== 8) {
        throw new InvalidInputError();
      }
      const buyTaxBps = parseBasisPoints(requiredPart(parts, 3), 5000);
      const sellTaxBps = parseBasisPoints(requiredPart(parts, 4), 5000);
      const taxDays = parsePositiveInteger(requiredPart(parts, 5), "taxDays");
      const proposal = await dependencies.flapLaunchService.createLaunchProposal({
        chatId,
        proposerTelegramId: fromId,
        name: requiredPart(parts, 0),
        symbol: requiredPart(parts, 1),
        metadataUri: requiredPart(parts, 2),
        buyTaxBps,
        sellTaxBps,
        taxDurationSeconds: taxDays * 24 * 60 * 60,
        recipients: parseVaultRecipients(requiredPart(parts, 6)),
        initialBuyWei: parseBnbAmount(requiredPart(parts, 7)),
        salt: createFlapSalt(),
        commissionReceiver: dependencies.config.platformCommissionReceiver
      });
      await ctx.reply(formatFlapLaunch(proposal), { reply_markup: flapLaunchKeyboard(proposal.id) });
    });
  });

  bot.command("flap_metadata", async (ctx) => {
    await handleUserCommand(ctx, "flap_metadata", async () => {
      const chatId = requireChatId(ctx.chat?.id);
      await requireGroupAdmin(ctx, chatId);
      const commandText = ctx.message?.text;
      if (commandText === undefined) {
        throw new InvalidInputError();
      }
      const payload = commandText.replace(/^\/flap_metadata(@\w+)?\s*/, "");
      const parts = payload.split("|");
      if (parts.length < 4 || parts.length > 7) {
        throw new InvalidInputError();
      }
      const metadataUri = await dependencies.flapMetadataService.createMetadata({
        name: requiredPart(parts, 0),
        symbol: requiredPart(parts, 1),
        description: requiredPart(parts, 2),
        imageUri: requiredPart(parts, 3),
        ...(emptyToUndefined(parts[4]) === undefined ? {} : { website: requiredPart(parts, 4) }),
        ...(emptyToUndefined(parts[5]) === undefined ? {} : { telegram: requiredPart(parts, 5) }),
        ...(emptyToUndefined(parts[6]) === undefined ? {} : { x: requiredPart(parts, 6) })
      });
      await ctx.reply(`Flap metadata uploaded: ${metadataUri}`);
    });
  });

  bot.command("safe_prepare", async (ctx) => {
    await handleUserCommand(ctx, "safe_prepare", async () => {
      const chatId = requireChatId(ctx.chat?.id);
      const parts = splitCommand(ctx.message?.text, 3);
      const sourceType = requiredPart(parts, 1);
      const sourceId = requiredPart(parts, 2);
      const submission =
        sourceType === "trade"
          ? await dependencies.safeSubmissionService.prepareTradeSubmission(chatId, sourceId)
          : sourceType === "flap"
            ? await dependencies.safeSubmissionService.prepareFlapLaunchSubmission(chatId, sourceId)
            : sourceType === "withdrawal"
              ? await dependencies.safeSubmissionService.prepareWithdrawalSubmission(chatId, sourceId)
              : null;
      if (submission === null) {
        throw new InvalidInputError("The source must be trade, flap, or withdrawal.");
      }
      await ctx.reply(formatSafeSubmission(submission), {
        reply_markup: safeSubmissionKeyboard(submission.id, dependencies.config.publicBaseUrl, ctx.chat?.type === "private")
      });
    });
  });

  bot.command("safe_submit", async (ctx) => {
    await handleUserCommand(ctx, "safe_submit", async () => {
      const fromId = requireTelegramUserId(ctx.from?.id);
      const parts = splitCommand(ctx.message?.text, 4);
      const submissionId = requiredPart(parts, 1);
      const ownerAddress = parseAddress(requiredPart(parts, 2));
      const signature = parseHex(requiredPart(parts, 3), "signature");
      const submission = await dependencies.safeSubmissionService.submitOwnerSignature(submissionId, ownerAddress, signature, fromId);
      await ctx.reply(formatSafeSubmission(submission), {
        reply_markup: safeSubmissionKeyboard(submission.id, dependencies.config.publicBaseUrl, ctx.chat?.type === "private")
      });
    });
  });

  bot.command("safe_status", async (ctx) => {
    await handleUserCommand(ctx, "safe_status", async () => {
      const parts = splitCommand(ctx.message?.text, 2);
      const status = await dependencies.safeSubmissionService.getStatus(requiredPart(parts, 1));
      await ctx.reply(formatSafeStatus(status));
    });
  });

  bot.command("safe_execute", async (ctx) => {
    await handleUserCommand(ctx, "safe_execute", async () => {
      const chatId = requireChatId(ctx.chat?.id);
      await requireGroupAdmin(ctx, chatId);
      const parts = splitCommand(ctx.message?.text, 2);
      const txHash = await dependencies.safeSubmissionService.execute(requiredPart(parts, 1));
      await ctx.reply(`Safe execution submitted: ${txHash}`);
    });
  });

  bot.command("safe_unlink", async (ctx) => {
    await handleUserCommand(ctx, "safe_unlink", async () => {
      await beginUnlink(dependencies, ctx);
    });
  });

  bot.callbackQuery(/^help:/, async (ctx) => {
    await handleCallback(ctx, async () => {
      const data = ctx.callbackQuery.data;
      await ctx.answerCallbackQuery();
      await ctx.reply(helpText(data.slice("help:".length)));
    });
  });

  registerSafeCallbacks(bot, dependencies);
  registerPoolCommands(bot, dependencies);

  bot.callbackQuery("prompt_back", async (ctx) => {
    await handlePromptBack(dependencies, ctx);
  });

  bot.callbackQuery("prompt_cancel", async (ctx) => {
    await handlePromptCancel(dependencies, ctx);
  });

  bot.callbackQuery(/^choice:/, async (ctx) => {
    await handlePromptChoice(dependencies, ctx);
  });

  bot.callbackQuery(/^menu:/, async (ctx) => {
    await ctx.answerCallbackQuery();
    try {
      await handleMenuSelection(dependencies, ctx, ctx.callbackQuery.data.slice("menu:".length));
    } catch (error) {
      if (error instanceof UserInputError || error instanceof AppError) {
        await ctx.reply(error.message);
        return;
      }
      Logger.error("[TelegramBot] Menu action failed", { err: error instanceof Error ? error : undefined });
      await ctx.reply("Something went wrong. Please try again.");
    }
  });

  bot.on("message:text", async (ctx) => {
    await routePromptInput(dependencies, ctx);
  });

  bot.on("callback_query:data", async (ctx) => {
    await ctx.answerCallbackQuery();
  });

  bot.catch((error) => {
    Logger.error("[TelegramBot] Unhandled bot error", { err: error.error instanceof Error ? error.error : undefined });
  });

  return bot;
}

async function handleCallback(ctx: Context, action: () => Promise<void>): Promise<void> {
  try {
    await action();
  } catch (error) {
    if (error instanceof UserInputError || error instanceof AppError) {
      await ctx.answerCallbackQuery({ text: error.message, show_alert: true });
      return;
    }
    Logger.error("[TelegramBot] Callback failed", { err: error instanceof Error ? error : undefined });
    await ctx.answerCallbackQuery({ text: "Action failed", show_alert: true });
  }
}
