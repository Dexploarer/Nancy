import { describe, expect, it } from "bun:test";
import { FixedWindowRateLimiter, clientKeyFromHeaders } from "../src/http/rateLimiter.js";

describe("FixedWindowRateLimiter", () => {
  it("allows up to the limit then blocks within a window", () => {
    let now = 1_000;
    const limiter = new FixedWindowRateLimiter(3, 1_000, () => now);

    expect(limiter.allow("a")).toBe(true);
    expect(limiter.allow("a")).toBe(true);
    expect(limiter.allow("a")).toBe(true);
    expect(limiter.allow("a")).toBe(false);
  });

  it("resets after the window elapses", () => {
    let now = 1_000;
    const limiter = new FixedWindowRateLimiter(1, 1_000, () => now);

    expect(limiter.allow("a")).toBe(true);
    expect(limiter.allow("a")).toBe(false);
    now += 1_000;
    expect(limiter.allow("a")).toBe(true);
  });

  it("tracks each key independently", () => {
    let now = 1_000;
    const limiter = new FixedWindowRateLimiter(1, 1_000, () => now);

    expect(limiter.allow("a")).toBe(true);
    expect(limiter.allow("b")).toBe(true);
    expect(limiter.allow("a")).toBe(false);
  });
});

describe("clientKeyFromHeaders", () => {
  it("prefers the cloudflare client IP header", () => {
    const headers = new Headers({ "cf-connecting-ip": "1.2.3.4", "x-forwarded-for": "9.9.9.9" });
    expect(clientKeyFromHeaders(headers)).toBe("1.2.3.4");
  });

  it("falls back to the first x-forwarded-for hop", () => {
    const headers = new Headers({ "x-forwarded-for": "5.6.7.8, 10.0.0.1" });
    expect(clientKeyFromHeaders(headers)).toBe("5.6.7.8");
  });

  it("uses a shared bucket when no client header is present", () => {
    expect(clientKeyFromHeaders(new Headers())).toBe("anonymous");
  });
});
