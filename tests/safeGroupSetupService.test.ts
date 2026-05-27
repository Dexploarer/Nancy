import { describe, expect, it, mock } from "bun:test";
import type { Address } from "viem";
import { SafeGroupSetupService } from "../src/services/safeGroupSetupService.js";
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
    const service = new SafeGroupSetupService(repository, fakeDeployment as never);
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
});
