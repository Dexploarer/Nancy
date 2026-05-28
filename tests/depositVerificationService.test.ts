import { describe, expect, it } from "bun:test";
import type { Address } from "viem";
import { DepositVerificationService, type NativeDepositClient } from "../src/services/depositVerificationService.js";

const transactionHash = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const linkedSender = "0x1111111111111111111111111111111111111111";
const unlinkedSender = "0x2222222222222222222222222222222222222222";
const safeAddress = "0x3333333333333333333333333333333333333333";
const otherSafeAddress = "0x4444444444444444444444444444444444444444";

describe("DepositVerificationService", () => {
  it("accepts a successful native deposit to the group Safe from a linked sender", async () => {
    const service = new DepositVerificationService("https://rpc.example", 56, fakeClient({
      from: linkedSender,
      to: safeAddress,
      value: 100n,
      status: "success"
    }));

    const deposit = await service.verifyNativeDeposit({
      transactionHash,
      safeAddress,
      amountWei: 100n,
      allowedSenders: [linkedSender]
    });

    expect(deposit.sender).toBe(linkedSender);
    expect(deposit.recipient).toBe(safeAddress);
    expect(deposit.amountWei).toBe(100n);
  });

  it("rejects deposits from a sender not linked to the Telegram user", async () => {
    const service = new DepositVerificationService("https://rpc.example", 56, fakeClient({
      from: linkedSender,
      to: safeAddress,
      value: 100n,
      status: "success"
    }));

    await expect(
      service.verifyNativeDeposit({
        transactionHash,
        safeAddress,
        amountWei: 100n,
        allowedSenders: []
      })
    ).rejects.toThrow("Link or generate a wallet");
  });

  it("rejects failed, wrong-recipient, wrong-amount, and unlinked-sender deposits", async () => {
    await expect(
      serviceFor({ from: linkedSender, to: safeAddress, value: 100n, status: "reverted" }).verifyNativeDeposit({
        transactionHash,
        safeAddress,
        amountWei: 100n,
        allowedSenders: [linkedSender]
      })
    ).rejects.toThrow("not successful");

    await expect(
      serviceFor({ from: linkedSender, to: otherSafeAddress, value: 100n, status: "success" }).verifyNativeDeposit({
        transactionHash,
        safeAddress,
        amountWei: 100n,
        allowedSenders: [linkedSender]
      })
    ).rejects.toThrow("directly to the group Safe");

    await expect(
      serviceFor({ from: linkedSender, to: safeAddress, value: 99n, status: "success" }).verifyNativeDeposit({
        transactionHash,
        safeAddress,
        amountWei: 100n,
        allowedSenders: [linkedSender]
      })
    ).rejects.toThrow("amount does not match");

    await expect(
      serviceFor({ from: unlinkedSender, to: safeAddress, value: 100n, status: "success" }).verifyNativeDeposit({
        transactionHash,
        safeAddress,
        amountWei: 100n,
        allowedSenders: [linkedSender]
      })
    ).rejects.toThrow("sender is not linked");
  });
});

type FakeDeposit = {
  from: Address;
  to: Address;
  value: bigint;
  status: "success" | "reverted";
};

function serviceFor(deposit: FakeDeposit): DepositVerificationService {
  return new DepositVerificationService("https://rpc.example", 56, fakeClient(deposit));
}

function fakeClient(deposit: FakeDeposit): NativeDepositClient {
  return {
    async getTransaction() {
      return {
        from: deposit.from,
        to: deposit.to,
        value: deposit.value
      };
    },
    async getTransactionReceipt() {
      return {
        status: deposit.status
      };
    }
  };
}
