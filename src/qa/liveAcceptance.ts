import { createPublicClient, http, type Address } from "viem";
import { bsc, bscTestnet } from "viem/chains";
import { z } from "zod";
import { getBscContractAddresses } from "../chain/addresses.js";
import { AppError } from "../domain/errors.js";
import { Logger } from "../logger.js";
import { assertHttpOk } from "./httpChecks.js";

const EnvSchema = z.object({
  TELEGRAM_BOT_TOKEN: z.string().min(1),
  BSC_RPC_URL: z.string().url(),
  BSC_CHAIN_ID: z.coerce.number().int().refine((value) => value === 56 || value === 97),
  SAFE_TRANSACTION_SERVICE_URL: z.string().url(),
  WALLET_ENCRYPTION_KEY: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
  PINATA_JWT: z.preprocess((value) => (value === "" ? undefined : value), z.string().min(1).optional())
});

const env = parseEnv();
const chain = env.BSC_CHAIN_ID === 56 ? bsc : bscTestnet;
const client = createPublicClient({
  chain,
  transport: http(env.BSC_RPC_URL)
});
const addresses = getBscContractAddresses(env.BSC_CHAIN_ID);

await assertChainId();
await assertContractCode("Safe singleton", addresses.safeSingleton);
await assertContractCode("Safe proxy factory", addresses.safeProxyFactory);
await assertContractCode("Safe MultiSendCallOnly", addresses.multiSendCallOnly);
await assertContractCode("Flap portal", addresses.portal);
await assertContractCode("Flap vault portal", addresses.vaultPortal);
await assertHttpOk({
  url: `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/getMe`,
  label: "Telegram getMe",
  errorMessage: "External service check failed"
});
await assertHttpOk({
  url: `${env.SAFE_TRANSACTION_SERVICE_URL.replace(/\/$/, "")}/api/v1/about/`,
  label: "Safe Transaction Service",
  errorMessage: "External service check failed"
});
if (env.PINATA_JWT !== undefined) {
  await assertHttpOk({
    url: "https://api.pinata.cloud/data/testAuthentication",
    label: "Pinata auth",
    errorMessage: "External service check failed",
    headers: {
      Authorization: `Bearer ${env.PINATA_JWT}`
    }
  });
}

Logger.info("[LiveAcceptance] Live acceptance checks passed", {
  chainId: env.BSC_CHAIN_ID,
  safeProxyFactory: addresses.safeProxyFactory,
  pinataChecked: env.PINATA_JWT !== undefined
});

function parseEnv(): z.infer<typeof EnvSchema> {
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new AppError("Live acceptance requires Telegram, BSC RPC, Safe Transaction Service, and wallet encryption env");
  }
  return parsed.data;
}

async function assertChainId(): Promise<void> {
  const chainId = await client.getChainId();
  if (chainId !== env.BSC_CHAIN_ID) {
    throw new AppError("BSC RPC returned the wrong chain ID", { expected: env.BSC_CHAIN_ID, actual: chainId });
  }
}

async function assertContractCode(label: string, address: Address): Promise<void> {
  const code = await client.getBytecode({ address });
  if (code === undefined || code === "0x") {
    throw new AppError("Contract code missing", { label, address });
  }
}
