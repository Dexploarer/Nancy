import { describe, expect, it } from "bun:test";
import type { Address } from "viem";
import { matchBlockDeposits, type ScannedTx } from "../src/services/depositWatcher.js";

const SAFE = "0x1111111111111111111111111111111111111111" as Address;
const LINKED = "0x2222222222222222222222222222222222222222" as Address;
const STRANGER = "0x3333333333333333333333333333333333333333" as Address;

const safeToChatId = new Map([[SAFE.toLowerCase(), "chat-1"]]);
const resolve = async (address: Address): Promise<string | null> =>
  address.toLowerCase() === LINKED.toLowerCase() ? "user-1" : null;

describe("matchBlockDeposits", () => {
  it("matches a BNB transfer to a group Safe from a linked wallet", async () => {
    const txs: ScannedTx[] = [{ hash: "0xaaa", from: LINKED, to: SAFE, value: 1000n }];
    expect(await matchBlockDeposits(txs, safeToChatId, resolve)).toEqual([
      { chatId: "chat-1", telegramUserId: "user-1", amountWei: 1000n, transactionHash: "0xaaa", sender: LINKED }
    ]);
  });

  it("ignores wrong-recipient, zero-value, unlinked-sender, and contract-creation txs", async () => {
    const txs: ScannedTx[] = [
      { hash: "0xb", from: LINKED, to: STRANGER, value: 1000n },
      { hash: "0xc", from: LINKED, to: SAFE, value: 0n },
      { hash: "0xd", from: STRANGER, to: SAFE, value: 1000n },
      { hash: "0xe", from: LINKED, to: null, value: 1000n }
    ];
    expect(await matchBlockDeposits(txs, safeToChatId, resolve)).toEqual([]);
  });
});
