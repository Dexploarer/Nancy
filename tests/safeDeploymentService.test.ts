import { describe, expect, it } from "bun:test";
import { decodeFunctionData } from "viem";
import { safeAbi, safeProxyFactoryAbi } from "../src/chain/abis.js";
import { getBscContractAddresses } from "../src/chain/addresses.js";
import { SafeDeploymentService } from "../src/services/safeDeploymentService.js";

describe("SafeDeploymentService", () => {
  it("builds a SafeProxyFactory deployment with a Safe setup initializer", () => {
    const addresses = getBscContractAddresses(56);
    const service = new SafeDeploymentService(addresses, "https://bsc-dataseed.bnbchain.org", 56);
    const owners = ["0x1111111111111111111111111111111111111111", "0x2222222222222222222222222222222222222222"] as const;

    const transaction = service.buildDeploymentTransaction([...owners], 2, 123n);
    const proxyCall = decodeFunctionData({ abi: safeProxyFactoryAbi, data: transaction.data });
    if (proxyCall.functionName !== "createProxyWithNonce") {
      throw new Error("Expected createProxyWithNonce");
    }
    const setupCall = decodeFunctionData({ abi: safeAbi, data: proxyCall.args[1] });
    if (setupCall.functionName !== "setup") {
      throw new Error("Expected setup");
    }

    expect(transaction.to).toBe(addresses.safeProxyFactory);
    expect(proxyCall.args[0]).toBe(addresses.safeSingleton);
    expect(proxyCall.args[2]).toBe(123n);
    expect(setupCall.args[0]).toEqual([...owners]);
    expect(setupCall.args[1]).toBe(2n);
    expect(setupCall.args[4]).toBe(addresses.safeFallbackHandler);
  });
});
