import { describe, expect, it } from "bun:test";
import { KeyedMutex } from "../src/services/keyedMutex.js";

describe("KeyedMutex", () => {
  it("serializes tasks for the same key", async () => {
    const mutex = new KeyedMutex();
    const order: string[] = [];
    const first = mutex.run("a", async () => {
      order.push("start-1");
      await Promise.resolve();
      await Promise.resolve();
      order.push("end-1");
    });
    const second = mutex.run("a", async () => {
      order.push("start-2");
      order.push("end-2");
    });
    await Promise.all([first, second]);
    expect(order).toEqual(["start-1", "end-1", "start-2", "end-2"]);
  });

  it("runs different keys concurrently", async () => {
    const mutex = new KeyedMutex();
    const order: string[] = [];
    let releaseA: () => void = () => {};
    const gateA = new Promise<void>((resolve) => {
      releaseA = resolve;
    });
    const a = mutex.run("a", async () => {
      order.push("a-start");
      await gateA;
      order.push("a-end");
    });
    const b = mutex.run("b", async () => {
      order.push("b-start");
      order.push("b-end");
      releaseA();
    });
    await Promise.all([a, b]);
    expect(order).toEqual(["a-start", "b-start", "b-end", "a-end"]);
  });

  it("does not wedge a key after a task throws", async () => {
    const mutex = new KeyedMutex();
    await expect(mutex.run("a", async () => Promise.reject(new Error("boom")))).rejects.toThrow("boom");
    await expect(mutex.run("a", async () => "ok")).resolves.toBe("ok");
  });
});
