import { describe, expect, it } from "bun:test";
import { assertDeploymentMatches, saltNonceForSession } from "../src/services/safeDeploymentService.js";
import { UserInputError } from "../src/domain/errors.js";

describe("saltNonceForSession", () => {
  it("is deterministic per session and differs across sessions", () => {
    expect(saltNonceForSession("setup_a")).toBe(saltNonceForSession("setup_a"));
    expect(saltNonceForSession("setup_a")).not.toBe(saltNonceForSession("setup_b"));
  });
});

describe("assertDeploymentMatches", () => {
  it("passes when factory and calldata match (case-insensitive)", () => {
    expect(() =>
      assertDeploymentMatches({ actualTo: "0xFacto", actualInput: "0xABC123", expectedTo: "0xfacto", expectedData: "0xabc123" })
    ).not.toThrow();
  });

  it("rejects a transaction sent to the wrong contract", () => {
    expect(() =>
      assertDeploymentMatches({ actualTo: "0xother", actualInput: "0xabc123", expectedTo: "0xfacto", expectedData: "0xabc123" })
    ).toThrow(UserInputError);
  });

  it("rejects mismatched calldata (tampered owners/threshold)", () => {
    expect(() =>
      assertDeploymentMatches({ actualTo: "0xfacto", actualInput: "0xdeadbeef", expectedTo: "0xfacto", expectedData: "0xabc123" })
    ).toThrow(UserInputError);
  });

  it("rejects a null recipient", () => {
    expect(() =>
      assertDeploymentMatches({ actualTo: null, actualInput: "0xabc123", expectedTo: "0xfacto", expectedData: "0xabc123" })
    ).toThrow(UserInputError);
  });
});
