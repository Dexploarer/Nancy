import express, { type Request, type Response } from "express";
import { webhookCallback } from "grammy";
import type { App } from "../app.js";
import type { AppConfig } from "../config.js";
import { AppError, UserInputError } from "../domain/errors.js";
import { Logger } from "../logger.js";
import { renderSigningPage } from "./signingPage.js";

export async function startHttpRuntime(appState: App, config: AppConfig): Promise<void> {
  const server = express();
  server.disable("x-powered-by");
  server.use(express.json({ limit: "1mb" }));

  server.get("/health", (_req: Request, res: Response) => {
    res.json({ ok: true });
  });

  server.get("/sign/:submissionId", async (req: Request, res: Response) => {
    await route(res, async () => {
      const submission = await appState.safeSubmissionService.getSubmission(requiredRouteParam(req.params["submissionId"]));
      if (submission === null) {
        res.status(404).send("Safe submission not found");
        return;
      }
      res.type("html").send(renderSigningPage(submission));
    });
  });

  if (config.telegramWebhookSecret !== undefined) {
    server.use(`/telegram/${config.telegramWebhookSecret}`, webhookCallback(appState.bot, "express"));
  }

  await new Promise<void>((resolve) => {
    server.listen(config.httpPort, () => {
      Logger.info("[HttpRuntime] HTTP server listening", { port: config.httpPort });
      resolve();
    });
  });

  if (config.publicBaseUrl !== undefined && config.telegramWebhookSecret !== undefined) {
    const webhookUrl = `${config.publicBaseUrl.replace(/\/$/, "")}/telegram/${config.telegramWebhookSecret}`;
    await appState.bot.api.setWebhook(webhookUrl);
    Logger.info("[HttpRuntime] Telegram webhook configured", { webhookUrl });
    return;
  }

  await appState.bot.start();
}

async function route(res: Response, action: () => Promise<void>): Promise<void> {
  try {
    await action();
  } catch (error) {
    if (error instanceof UserInputError || error instanceof AppError) {
      res.status(400).json({ error: error.message });
      return;
    }
    Logger.error("[HttpRuntime] Request failed", { err: error instanceof Error ? error : undefined });
    res.status(500).json({ error: "Request failed" });
  }
}

function requiredRouteParam(value: string | string[] | undefined): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new UserInputError("Missing route parameter");
  }
  return value;
}
