import { describe, expect, it, mock } from "bun:test";
import type { Address } from "viem";
import { ManagedWalletService } from "../src/services/managedWalletService.js";
import { SafeGroupSetupService } from "../src/services/safeGroupSetupService.js";
import { WalletEncryptionService } from "../src/services/walletEncryptionService.js";
import { MemoryRepository } from "../src/storage/memoryRepository.js";

class FakeSafeDeploymentService {
  createSafe = mock(async (input: { owners: Address[]; threshold: number }) => ({
    safeAddress: "0x9999999999999999999999999999999999999999" as Address,
    transactionHash: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as const,
    threshold: input.threshold,
    owners: input.owners
  }));
}

describe("SafeGroupSetupService", () => {
  it("lets linked Telegram members join and deploys a group Safe", async () => {
    const repository = new MemoryRepository();
    const fakeDeployment = new FakeSafeDeploymentService();
    const managedWalletService = new ManagedWalletService(
      repository,
      new WalletEncryptionService("0x1111111111111111111111111111111111111111111111111111111111111111")
    );
    const service = new SafeGroupSetupService(repository, fakeDeployment as never, managedWalletService);
    await repository.saveWalletLink({
      telegramUserId: "111",
      address: "0x1111111111111111111111111111111111111111",
      nonce: "n1",
      status: "linked",
      createdAt: new Date("2026-05-27T00:00:00.000Z"),
      linkedAt: new Date("2026-05-27T00:00:01.000Z")
    });
    await repository.saveWalletLink({
      telegramUserId: "222",
      address: "0x2222222222222222222222222222222222222222",
      nonce: "n2",
      status: "linked",
      createdAt: new Date("2026-05-27T00:00:00.000Z"),
      linkedAt: new Date("2026-05-27T00:00:01.000Z")
    });

    const setup = await service.createSession("chat", "admin", 2);
    await service.joinWithDefaultWallet(setup.id, "111");
    const joined = await service.joinWithDefaultWallet(setup.id, "222");
    const deployed = await service.deploy(setup.id);
    const wallet = await repository.getGroupWallet("chat");

    expect(joined.owners).toHaveLength(2);
    expect(deployed.session.status).toBe("deployed");
    expect(wallet?.safeAddress).toBe("0x9999999999999999999999999999999999999999");
    expect(fakeDeployment.createSafe).toHaveBeenCalledTimes(1);
  });

  it("can generate and join a managed wallet in one group setup action", async () => {
    const repository = new MemoryRepository();
    const service = new SafeGroupSetupService(
      repository,
      new FakeSafeDeploymentService() as never,
      new ManagedWalletService(repository, new WalletEncryptionService("0x1111111111111111111111111111111111111111111111111111111111111111"))
    );

    const setup = await service.createSession("chat", "admin", 1);
    const result = await service.generateManagedWalletAndJoin(setup.id, "111");

    expect(result.generated.privateKey).toStartWith("0x");
    expect(result.session.owners).toHaveLength(1);
    expect(result.session.owners[0]?.address).toBe(result.generated.wallet.address);
  });
});
