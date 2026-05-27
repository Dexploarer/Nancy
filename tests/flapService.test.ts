import { describe, expect, it } from "bun:test";
import { createFlapSalt, encodeSplitVaultData, parseVaultRecipients } from "../src/chain/flapService.js";
import { UserInputError } from "../src/domain/errors.js";

describe("Split Vault encoding", () => {
  it("accepts up to 10 recipients that sum to 10000 bps", () => {
    const recipients = parseVaultRecipients(
      "0x1111111111111111111111111111111111111111:2500,0x2222222222222222222222222222222222222222:7500"
    );

    const data = encodeSplitVaultData(recipients);

    expect(data.startsWith("0x")).toBe(true);
    expect(recipients).toEqual([
      { address: "0x1111111111111111111111111111111111111111", bps: 2500 },
      { address: "0x2222222222222222222222222222222222222222", bps: 7500 }
    ]);
  });

  it("rejects recipient splits that do not sum to 10000 bps", () => {
    expect(() =>
      parseVaultRecipients("0x1111111111111111111111111111111111111111:2500,0x2222222222222222222222222222222222222222:7000")
    ).toThrow(UserInputError);
  });

  it("rejects duplicate recipients", () => {
    expect(() =>
      parseVaultRecipients("0x1111111111111111111111111111111111111111:5000,0x1111111111111111111111111111111111111111:5000")
    ).toThrow(UserInputError);
  });

  it("creates a Flap salt with the required 7777 suffix", () => {
    const salt = createFlapSalt();

    expect(salt).toHaveLength(66);
    expect(salt.endsWith("7777")).toBe(true);
  });
});
