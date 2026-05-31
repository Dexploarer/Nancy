import { describe, expect, it } from "bun:test";
import { ConcurrencyGate } from "../src/concurrencyGate.js";

// Helper: resolves to "waiting" if the acquire() promise hasn't settled in a microtask.
async function isPending(p: Promise<unknown>): Promise<boolean> {
  return (await Promise.race([p.then(() => "settled"), Promise.resolve("waiting")])) === "waiting";
}

describe("ConcurrencyGate", () => {
  it("grants up to maxConcurrent slots immediately, then makes the next caller wait", async () => {
    const gate = new ConcurrencyGate(2, 4);
    expect(await gate.acquire()).toBe(true);
    expect(await gate.acquire()).toBe(true);
    const third = gate.acquire();
    expect(await isPending(third)).toBe(true);
    gate.release(); // free a slot -> the waiter proceeds
    expect(await third).toBe(true);
  });

  it("rejects once the active slots and the wait queue are both full", async () => {
    const gate = new ConcurrencyGate(1, 1);
    expect(await gate.acquire()).toBe(true); // active full
    const queued = gate.acquire(); // fills the queue
    expect(await isPending(queued)).toBe(true);
    expect(await gate.acquire()).toBe(false); // nowhere to go -> reject
    gate.release(); // let the queued one through so nothing dangles
    expect(await queued).toBe(true);
  });

  it("frees a slot on release so a later acquirer can take it", async () => {
    const gate = new ConcurrencyGate(1, 2);
    expect(await gate.acquire()).toBe(true);
    gate.release();
    expect(await gate.acquire()).toBe(true);
  });
});
