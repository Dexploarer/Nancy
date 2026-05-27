import { privateKeyToAccount } from "viem/accounts";
import { describe, expect, it } from "bun:test";
import { buildSignatureBytes, normalizeOwnerSignature, SafeService } from "../src/chain/safeService.js";
import type { ChainTransaction } from "../src/domain/types.js";

const MULTISEND = "0x9641d764fc13c8B624c04430C7356C1C7C8102e2";

describe("SafeService", () => {
  it("uses a direct Safe call for single-leg proposals", () => {
    const transaction: ChainTransaction = {
      to: "0x1111111111111111111111111111111111111111",
      value: 123n,
      data: "0xabcd",
      label: "single"
    };

    const safeTransaction = SafeService.buildSafeTransactionData([transaction], 7n, MULTISEND);

    expect(safeTransaction).toMatchObject({
      to: transaction.to,
      value: 123n,
      data: "0xabcd",
      operation: 0,
      nonce: 7n
    });
  });

  it("uses MultiSendCallOnly for multi-leg proposals", () => {
    const transactions: ChainTransaction[] = [
      {
        to: "0x1111111111111111111111111111111111111111",
        value: 1n,
        data: "0x",
        label: "fee"
      },
      {
        to: "0x2222222222222222222222222222222222222222",
        value: 2n,
        data: "0xabcd",
        label: "buy"
      }
    ];

    const safeTransaction = SafeService.buildSafeTransactionData(transactions, 8n, MULTISEND);

    expect(safeTransaction.to).toBe(MULTISEND);
    expect(safeTransaction.value).toBe(0n);
    expect(safeTransaction.operation).toBe(1);
    expect(safeTransaction.nonce).toBe(8n);
    expect(safeTransaction.data.startsWith("0x8d80ff0a")).toBe(true);
  });

  it("normalizes personal_sign signatures for Safe eth_sign submission", async () => {
    const account = privateKeyToAccount("0x59c6995e998f97a5a004497e5da5cf9e7ae6b36f10a0edbb1d5828dce3f2b0b5");
    const signature = await account.signMessage({
      message: {
        raw: "0x1111111111111111111111111111111111111111111111111111111111111111"
      }
    });

    const normalized = await normalizeOwnerSignature(
      "0x1111111111111111111111111111111111111111111111111111111111111111",
      account.address,
      signature
    );

    expect(normalized).not.toBe(signature);
    expect(["1f", "20"]).toContain(normalized.slice(-2));
  });

  it("sorts Safe signatures by owner address", () => {
    const signatures = buildSignatureBytes([
      {
        owner: "0x2222222222222222222222222222222222222222",
        signature: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb1f"
      },
      {
        owner: "0x1111111111111111111111111111111111111111",
        signature: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1f"
      }
    ]);

    expect(signatures.startsWith("0xaaaaaaaa")).toBe(true);
  });
});
