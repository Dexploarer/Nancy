import { decodeFunctionData } from "viem";
import { safeAbi, safeProxyFactoryAbi } from "../chain/abis.js";
import { getBscContractAddresses, NATIVE_TOKEN_ADDRESS } from "../chain/addresses.js";
import { AppError } from "../domain/errors.js";
import type { SafeSubmission } from "../domain/types.js";
import { renderSigningPage } from "../http/signingPage.js";
import { Logger } from "../logger.js";
import { SafeDeploymentService } from "../services/safeDeploymentService.js";

const addresses = getBscContractAddresses(56);

if (
  addresses.safeSingleton === NATIVE_TOKEN_ADDRESS ||
  addresses.safeProxyFactory === NATIVE_TOKEN_ADDRESS ||
  addresses.safeFallbackHandler === NATIVE_TOKEN_ADDRESS
) {
  throw new AppError("Safe deployment addresses are not configured");
}

const deploymentService = new SafeDeploymentService(addresses, "https://bsc-dataseed.bnbchain.org", 56);
const deploymentTransaction = deploymentService.buildDeploymentTransaction(
  ["0x1111111111111111111111111111111111111111", "0x2222222222222222222222222222222222222222"],
  2,
  1n
);
const proxyCall = decodeFunctionData({ abi: safeProxyFactoryAbi, data: deploymentTransaction.data });
if (proxyCall.functionName !== "createProxyWithNonce") {
  throw new AppError("Safe deployment transaction is not createProxyWithNonce");
}
const setupCall = decodeFunctionData({ abi: safeAbi, data: proxyCall.args[1] });
if (setupCall.functionName !== "setup") {
  throw new AppError("Safe deployment initializer is not setup");
}

const signingPage = renderSigningPage(sampleSubmission());
if (!signingPage.includes("/api/safe-submissions/") || signingPage.includes("/safe_submit")) {
  throw new AppError("Signing page does not submit through the HTTP API");
}

Logger.info("[StaticAcceptance] Static acceptance checks passed", {
  safeProxyFactory: addresses.safeProxyFactory,
  safeSingleton: addresses.safeSingleton
});

function sampleSubmission(): SafeSubmission {
  return {
    id: "safe_static",
    chatId: "chat",
    sourceType: "trade",
    sourceId: "trade_static",
    safeAddress: "0x1111111111111111111111111111111111111111",
    safeTxHash: "0x2222222222222222222222222222222222222222222222222222222222222222",
    safeTransaction: {
      to: "0x3333333333333333333333333333333333333333",
      value: 0n,
      data: "0x",
      operation: 0,
      safeTxGas: 0n,
      baseGas: 0n,
      gasPrice: 0n,
      gasToken: NATIVE_TOKEN_ADDRESS,
      refundReceiver: NATIVE_TOKEN_ADDRESS,
      nonce: 0n
    },
    transactionServiceUrl: "https://safe.example",
    status: "prepared",
    createdAt: new Date("2026-05-27T00:00:00.000Z")
  };
}
