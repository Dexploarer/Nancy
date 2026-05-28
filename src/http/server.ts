import { webhookCallback } from "grammy";
import { z } from "zod";
import type { App } from "../app.js";
import type { AppConfig } from "../config.js";
import { AppError, UserInputError } from "../domain/errors.js";
import { Logger } from "../logger.js";
import { parseAddress, parseHex } from "../utils/evm.js";
import { renderSigningPage } from "./signingPage.js";
import { renderLinkPage, renderLinkStartPage } from "./linkPage.js";
import { renderPoolPage } from "./poolPage.js";
import { verifyTelegramInitData } from "./telegramInitData.js";
import { serializePoolAnalytics } from "./poolAnalyticsResponse.js";
import { configureTelegramBot } from "../bot/telegramCommands.js";

const SignaturePayloadSchema = z.object({
  telegramUserId: z.string().regex(/^\d+$/).optional(),
  telegramInitData: z.string().optional(),
  ownerAddress: z.string().min(1),
  signature: z.string().regex(/^0x[0-9a-fA-F]+$/)
});

const WalletLinkPayloadSchema = z.object({
  signature: z.string().regex(/^0x[0-9a-fA-F]+$/)
});

const CreateWalletLinkPayloadSchema = z.object({
  telegramUserId: z.string().regex(/^\d+$/).optional(),
  telegramInitData: z.string().optional(),
  address: z.string().min(1)
});

export function createFetchHandler(appState: App, config: AppConfig): (request: Request) => Response | Promise<Response> {
  const webhookPath = config.telegramWebhookSecret === undefined ? undefined : `/telegram/${config.telegramWebhookSecret}`;
  const webhookHandler = webhookPath === undefined ? undefined : webhookCallback(appState.bot, "bun");

  return function fetch(request: Request): Response | Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") {
      return Response.json({ ok: true });
    }
    if (request.method === "GET" && url.pathname.startsWith("/sign/")) {
      return route(async () => renderSafeSigningPage(appState, url.pathname, config.walletConnectProjectId, config.bscChainId));
    }
    if (request.method === "GET" && url.pathname === "/link") {
      return route(async () =>
        new Response(renderLinkStartPage(config.walletConnectProjectId, config.bscChainId), {
          headers: { "Content-Type": "text/html; charset=utf-8" }
        })
      );
    }
    if (request.method === "GET" && url.pathname.startsWith("/link/")) {
      return route(async () => renderWalletLinkPage(appState, url.pathname, config.walletConnectProjectId, config.bscChainId));
    }
    if (request.method === "GET" && url.pathname.startsWith("/pool/")) {
      return route(async () => renderPoolAnalyticsPage(url.pathname));
    }
    if (request.method === "GET" && url.pathname.startsWith("/api/pools/") && url.pathname.endsWith("/analytics")) {
      return route(async () => getPoolAnalytics(appState, config, url));
    }
    if (request.method === "POST" && url.pathname === "/api/wallet-links") {
      return route(async () => createWalletLink(appState, config, request));
    }
    if (request.method === "POST" && url.pathname.startsWith("/api/wallet-links/")) {
      return route(async () => submitWalletLinkSignature(appState, request, url.pathname));
    }
    if (request.method === "POST" && url.pathname.startsWith("/api/safe-submissions/")) {
      return route(async () => submitSafeSignature(appState, config, request, url.pathname));
    }
    if (request.method === "POST" && webhookPath !== undefined && url.pathname === webhookPath && webhookHandler !== undefined) {
      return webhookHandler(request);
    }
    return Response.json({ error: "Not found" }, { status: 404 });
  };
}

export async function startHttpRuntime(appState: App, config: AppConfig): Promise<void> {
  await configureTelegramBot(appState.bot);
  Logger.info("[HttpRuntime] Telegram commands configured");

  Bun.serve({
    port: config.httpPort,
    fetch: createFetchHandler(appState, config)
  });

  Logger.info("[HttpRuntime] HTTP server listening", { port: config.httpPort });

  if (config.publicBaseUrl !== undefined && config.telegramWebhookSecret !== undefined) {
    const webhookUrl = `${config.publicBaseUrl.replace(/\/$/, "")}/telegram/${config.telegramWebhookSecret}`;
    await appState.bot.api.setWebhook(webhookUrl);
    Logger.info("[HttpRuntime] Telegram webhook configured", { webhookUrl });
    return;
  }

  await appState.bot.api.deleteWebhook();
  Logger.info("[HttpRuntime] Telegram webhook cleared for local polling");
  await appState.bot.start();
}

async function renderSafeSigningPage(appState: App, pathname: string, walletConnectProjectId?: string, chainId?: number): Promise<Response> {
  const submission = await appState.safeSubmissionService.getSubmission(requiredPathSuffix(pathname, "/sign/"));
  if (submission === null) {
    return new Response("Safe submission not found", { status: 404 });
  }
  return new Response(renderSigningPage(submission, walletConnectProjectId, chainId), {
    headers: { "Content-Type": "text/html; charset=utf-8" }
  });
}

async function renderWalletLinkPage(appState: App, pathname: string, walletConnectProjectId?: string, chainId?: number): Promise<Response> {
  const nonce = requiredPathSuffix(pathname, "/link/");
  const link = await appState.walletLinkService.getPendingLinkByNonce(nonce);
  return new Response(renderLinkPage(link, walletConnectProjectId, chainId), {
    headers: { "Content-Type": "text/html; charset=utf-8" }
  });
}

async function submitWalletLinkSignature(appState: App, request: Request, pathname: string): Promise<Response> {
  const nonce = requiredApiWalletLinkNonce(pathname);
  const payload = await parseWalletLinkBody(request);
  const link = await appState.walletLinkService.completeLinkByNonce(nonce, parseHex(payload.signature, "signature"));
  return Response.json({ address: link.address, status: link.status });
}

// Link-by-connect: the page connects a wallet, identifies the user from verified
// Telegram initData, and starts a pending link for the connected address — so the
// user never types their address or a nonce.
async function createWalletLink(appState: App, config: AppConfig, request: Request): Promise<Response> {
  const payload = await parseCreateWalletLinkBody(request);
  const telegramUserId = resolveTelegramUserIdFromBody(payload, config);
  const { link, message } = await appState.walletLinkService.beginLink(telegramUserId, parseAddress(payload.address));
  return Response.json({ nonce: link.nonce, message });
}

async function renderPoolAnalyticsPage(pathname: string): Promise<Response> {
  return new Response(renderPoolPage(requiredPathSuffix(pathname, "/pool/")), {
    headers: { "Content-Type": "text/html; charset=utf-8" }
  });
}

async function getPoolAnalytics(appState: App, config: AppConfig, url: URL): Promise<Response> {
  const analytics = await appState.poolService.getAnalytics(
    requiredApiPoolChatId(url.pathname),
    resolveTelegramUserIdFromQuery(url, config)
  );
  return Response.json(serializePoolAnalytics(analytics));
}

async function submitSafeSignature(appState: App, config: AppConfig, request: Request, pathname: string): Promise<Response> {
  const submissionId = requiredApiSubmissionId(pathname);
  const payload = await parseJsonBody(request);
  const submission = await appState.safeSubmissionService.submitOwnerSignature(
    submissionId,
    parseAddress(payload.ownerAddress),
    parseHex(payload.signature, "signature"),
    resolveTelegramUserId(payload, config.telegramBotToken)
  );
  return Response.json({
    id: submission.id,
    status: submission.status,
    safeTxHash: submission.safeTxHash
  });
}

function resolveTelegramUserId(payload: z.infer<typeof SignaturePayloadSchema>, telegramBotToken: string): string {
  if (payload.telegramInitData !== undefined && payload.telegramInitData.length > 0) {
    return verifyTelegramInitData(payload.telegramInitData, telegramBotToken);
  }
  if (payload.telegramUserId !== undefined) {
    return payload.telegramUserId;
  }
  throw new UserInputError("Telegram user identity is required");
}

function resolveTelegramUserIdFromBody(payload: z.infer<typeof CreateWalletLinkPayloadSchema>, config: AppConfig): string {
  if (payload.telegramInitData !== undefined && payload.telegramInitData.length > 0) {
    return verifyTelegramInitData(payload.telegramInitData, config.telegramBotToken);
  }
  if (config.appEnv !== "production" && payload.telegramUserId !== undefined) {
    return payload.telegramUserId;
  }
  throw new UserInputError("Telegram Web App identity is required");
}

function resolveTelegramUserIdFromQuery(url: URL, config: AppConfig): string {
  const telegramInitData = url.searchParams.get("telegramInitData");
  if (telegramInitData !== null && telegramInitData.length > 0) {
    return verifyTelegramInitData(telegramInitData, config.telegramBotToken);
  }
  const localTelegramUserId = url.searchParams.get("telegramUserId");
  if (config.appEnv !== "production" && localTelegramUserId !== null && /^\d+$/.test(localTelegramUserId)) {
    return localTelegramUserId;
  }
  throw new UserInputError("Telegram Web App identity is required");
}

async function route(action: () => Promise<Response>): Promise<Response> {
  try {
    return await action();
  } catch (error) {
    if (error instanceof UserInputError || error instanceof AppError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    Logger.error("[HttpRuntime] Request failed", { err: error instanceof Error ? error : undefined });
    return Response.json({ error: "Request failed" }, { status: 500 });
  }
}

function requiredPathSuffix(pathname: string, prefix: string): string {
  if (!pathname.startsWith(prefix) || pathname.length <= prefix.length) {
    throw new UserInputError("Missing route parameter");
  }
  return decodeURIComponent(pathname.slice(prefix.length));
}

function requiredApiSubmissionId(pathname: string): string {
  const prefix = "/api/safe-submissions/";
  const suffix = "/signatures";
  if (!pathname.startsWith(prefix) || !pathname.endsWith(suffix)) {
    throw new UserInputError("Invalid Safe signature route");
  }
  const submissionId = pathname.slice(prefix.length, -suffix.length);
  if (submissionId.length === 0) {
    throw new UserInputError("Missing Safe submission ID");
  }
  return decodeURIComponent(submissionId);
}

function requiredApiWalletLinkNonce(pathname: string): string {
  const prefix = "/api/wallet-links/";
  const suffix = "/signatures";
  if (!pathname.startsWith(prefix) || !pathname.endsWith(suffix)) {
    throw new UserInputError("Invalid wallet-link signature route");
  }
  const nonce = pathname.slice(prefix.length, -suffix.length);
  if (nonce.length === 0) {
    throw new UserInputError("Missing wallet-link nonce");
  }
  return decodeURIComponent(nonce);
}

function requiredApiPoolChatId(pathname: string): string {
  const prefix = "/api/pools/";
  const suffix = "/analytics";
  if (!pathname.startsWith(prefix) || !pathname.endsWith(suffix)) {
    throw new UserInputError("Invalid pool analytics route");
  }
  const chatId = pathname.slice(prefix.length, -suffix.length);
  if (chatId.length === 0) {
    throw new UserInputError("Missing pool chat ID");
  }
  return decodeURIComponent(chatId);
}

async function parseJsonBody(request: Request): Promise<z.infer<typeof SignaturePayloadSchema>> {
  try {
    return SignaturePayloadSchema.parse(await request.json());
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      throw new UserInputError("Invalid signature submission body");
    }
    throw error;
  }
}

async function parseWalletLinkBody(request: Request): Promise<z.infer<typeof WalletLinkPayloadSchema>> {
  try {
    return WalletLinkPayloadSchema.parse(await request.json());
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      throw new UserInputError("Invalid wallet-link submission body");
    }
    throw error;
  }
}

async function parseCreateWalletLinkBody(request: Request): Promise<z.infer<typeof CreateWalletLinkPayloadSchema>> {
  try {
    return CreateWalletLinkPayloadSchema.parse(await request.json());
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      throw new UserInputError("Invalid wallet-link request body");
    }
    throw error;
  }
}
