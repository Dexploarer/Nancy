import { webhookCallback } from "grammy";
import { z } from "zod";
import type { App } from "../app.js";
import type { AppConfig } from "../config.js";
import { AppError, UserInputError } from "../domain/errors.js";
import { Logger } from "../logger.js";
import { parseAddress, parseHex } from "../utils/evm.js";
import { renderSigningPage } from "./signingPage.js";
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

export async function startHttpRuntime(appState: App, config: AppConfig): Promise<void> {
  const webhookPath = config.telegramWebhookSecret === undefined ? undefined : `/telegram/${config.telegramWebhookSecret}`;
  const webhookHandler = webhookPath === undefined ? undefined : webhookCallback(appState.bot, "bun");

  await configureTelegramBot(appState.bot);
  Logger.info("[HttpRuntime] Telegram commands configured");

  Bun.serve({
    port: config.httpPort,
    async fetch(request) {
      const url = new URL(request.url);
      if (request.method === "GET" && url.pathname === "/health") {
        return Response.json({ ok: true });
      }
      if (request.method === "GET" && url.pathname.startsWith("/sign/")) {
        return route(async () => renderSafeSigningPage(appState, url.pathname));
      }
      if (request.method === "GET" && url.pathname.startsWith("/pool/")) {
        return route(async () => renderPoolAnalyticsPage(url.pathname));
      }
      if (request.method === "GET" && url.pathname.startsWith("/api/pools/") && url.pathname.endsWith("/analytics")) {
        return route(async () => getPoolAnalytics(appState, config, url));
      }
      if (request.method === "POST" && url.pathname.startsWith("/api/safe-submissions/")) {
        return route(async () => submitSafeSignature(appState, config, request, url.pathname));
      }
      if (request.method === "POST" && webhookPath !== undefined && url.pathname === webhookPath && webhookHandler !== undefined) {
        return webhookHandler(request);
      }
      return Response.json({ error: "Not found" }, { status: 404 });
    }
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

async function renderSafeSigningPage(appState: App, pathname: string): Promise<Response> {
  const submission = await appState.safeSubmissionService.getSubmission(requiredPathSuffix(pathname, "/sign/"));
  if (submission === null) {
    return new Response("Safe submission not found", { status: 404 });
  }
  return new Response(renderSigningPage(submission), {
    headers: { "Content-Type": "text/html; charset=utf-8" }
  });
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
