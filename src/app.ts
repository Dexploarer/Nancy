import type { AppConfig } from "./config.js";
import { getBscContractAddresses } from "./chain/addresses.js";
import { FlapService } from "./chain/flapService.js";
import { SafeService } from "./chain/safeService.js";
import { PancakeSwapService } from "./chain/pancakeSwapService.js";
import { createBot } from "./bot/bot.js";
import { GroupWalletService } from "./services/groupWalletService.js";
import { TradeService } from "./services/tradeService.js";
import { FlapLaunchService } from "./services/flapLaunchService.js";
import { SafeSubmissionService } from "./services/safeSubmissionService.js";
import { MemoryRepository } from "./storage/memoryRepository.js";
import { PostgresRepository } from "./storage/postgresRepository.js";
import type { Repository } from "./storage/repository.js";
import { AppError } from "./domain/errors.js";

export function buildApp(config: AppConfig): ReturnType<typeof createBot> {
  const repository = createRepository(config);
  const addresses = getBscContractAddresses(config.bscChainId);
  const flapService = new FlapService(addresses, config.bscRpcUrl, config.bscChainId);
  const pancakeSwapService = new PancakeSwapService(addresses, config.bscRpcUrl, config.bscChainId);
  const safeService = new SafeService(
    addresses,
    config.bscRpcUrl,
    config.bscChainId,
    config.safeTransactionServiceUrl,
    config.safeApiKey,
    config.safeExecutorPrivateKey
  );
  const groupWalletService = new GroupWalletService(repository);
  const tradeService = new TradeService(repository, flapService, pancakeSwapService);
  const flapLaunchService = new FlapLaunchService(repository, flapService);
  const safeSubmissionService = new SafeSubmissionService(repository, safeService);
  return createBot({
    repository,
    groupWalletService,
    tradeService,
    flapLaunchService,
    safeSubmissionService,
    config
  });
}

function createRepository(config: AppConfig): Repository {
  if (config.storageDriver === "memory") {
    return new MemoryRepository();
  }
  if (config.databaseUrl === undefined) {
    throw new AppError("DATABASE_URL is required when STORAGE_DRIVER=postgres");
  }
  return new PostgresRepository(config.databaseUrl);
}
