import "dotenv/config";
import { z } from "zod";
import { parseAddress } from "./utils/evm.js";

const EnvSchema = z
  .object({
    APP_ENV: z.enum(["development", "test", "production"]),
    STORAGE_DRIVER: z.enum(["memory", "postgres"]),
    TELEGRAM_BOT_TOKEN: z.string().min(1),
    BSC_CHAIN_ID: z.coerce.number().int().refine((value) => value === 56 || value === 97, {
      message: "BSC_CHAIN_ID must be 56 or 97"
    }),
    BSC_RPC_URL: z.string().url(),
    PLATFORM_FEE_RECIPIENT: z.string().min(1),
    PLATFORM_COMMISSION_RECEIVER: z.string().min(1),
    TRADE_FEE_BPS: z.coerce.number().int().min(0).max(100),
    DATABASE_URL: z.string().url().optional(),
    SAFE_TRANSACTION_SERVICE_URL: z.preprocess((value) => (value === "" ? undefined : value), z.string().url().optional()),
    SAFE_API_KEY: z.preprocess((value) => (value === "" ? undefined : value), z.string().min(1).optional())
  })
  .superRefine((env, ctx) => {
    if (env.STORAGE_DRIVER === "postgres" && env.DATABASE_URL === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["DATABASE_URL"],
        message: "DATABASE_URL is required when STORAGE_DRIVER=postgres"
      });
    }
  });

export type AppConfig = {
  appEnv: "development" | "test" | "production";
  storageDriver: "memory" | "postgres";
  telegramBotToken: string;
  bscChainId: 56 | 97;
  bscRpcUrl: string;
  platformFeeRecipient: ReturnType<typeof parseAddress>;
  platformCommissionReceiver: ReturnType<typeof parseAddress>;
  tradeFeeBps: number;
  databaseUrl?: string;
  safeTransactionServiceUrl?: string;
  safeApiKey?: string;
};

export function loadConfig(): AppConfig {
  const env = EnvSchema.parse(process.env);
  return {
    appEnv: env.APP_ENV,
    storageDriver: env.STORAGE_DRIVER,
    telegramBotToken: env.TELEGRAM_BOT_TOKEN,
    bscChainId: env.BSC_CHAIN_ID,
    bscRpcUrl: env.BSC_RPC_URL,
    platformFeeRecipient: parseAddress(env.PLATFORM_FEE_RECIPIENT),
    platformCommissionReceiver: parseAddress(env.PLATFORM_COMMISSION_RECEIVER),
    tradeFeeBps: env.TRADE_FEE_BPS,
    ...(env.DATABASE_URL === undefined ? {} : { databaseUrl: env.DATABASE_URL }),
    ...(env.SAFE_TRANSACTION_SERVICE_URL === undefined ? {} : { safeTransactionServiceUrl: env.SAFE_TRANSACTION_SERVICE_URL }),
    ...(env.SAFE_API_KEY === undefined ? {} : { safeApiKey: env.SAFE_API_KEY })
  };
}
