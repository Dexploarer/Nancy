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
import { WalletLinkService } from "./services/walletLinkService.js";
import { TokenRiskService } from "./services/tokenRiskService.js";
import { FlapMetadataService } from "./services/flapMetadataService.js";
import { SafeDeploymentService } from "./services/safeDeploymentService.js";
import { SafeGroupSetupService } from "./services/safeGroupSetupService.js";
import { MemoryRepository } from "./storage/memoryRepository.js";
import { PostgresRepository } from "./storage/postgresRepository.js";
import type { Repository } from "./storage/repository.js";
import { AppError } from "./domain/errors.js";
import type { Bot } from "grammy";

export type App = {
  bot: Bot;
  repository: Repository;
  safeSubmissionService: SafeSubmissionService;
  safeDeploymentService: SafeDeploymentService;
  safeGroupSetupService: SafeGroupSetupService;
  walletLinkService: WalletLinkService;
  flapMetadataService: FlapMetadataService;
};

export function buildApp(config: AppConfig): App {
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
  const walletLinkService = new WalletLinkService(repository);
  const safeDeploymentService = new SafeDeploymentService(
    addresses,
    config.bscRpcUrl,
    config.bscChainId,
    config.safeExecutorPrivateKey
  );
  const safeGroupSetupService = new SafeGroupSetupService(repository, safeDeploymentService);
  const tokenRiskService = new TokenRiskService({
    mode: config.riskCheckMode,
    minLiquidityUsd: config.minLiquidityUsd,
    maxBuyTaxBps: config.maxBuyTaxBps,
    maxSellTaxBps: config.maxSellTaxBps
  });
  const tradeService = new TradeService(repository, flapService, pancakeSwapService, tokenRiskService);
  const flapLaunchService = new FlapLaunchService(repository, flapService);
  const flapMetadataService = new FlapMetadataService(config.pinataJwt);
  const safeSubmissionService = new SafeSubmissionService(repository, safeService, walletLinkService);
  const bot = createBot({
    repository,
    groupWalletService,
    walletLinkService,
    tradeService,
    flapLaunchService,
    flapMetadataService,
    safeDeploymentService,
    safeGroupSetupService,
    safeSubmissionService,
    config
  });
  return {
    bot,
    repository,
    safeSubmissionService,
    safeDeploymentService,
    safeGroupSetupService,
    walletLinkService,
    flapMetadataService
  };
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
