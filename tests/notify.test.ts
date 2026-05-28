import { describe, expect, it, mock } from "bun:test";
import { notifyGroup } from "../src/services/notify.js";

describe("notifyGroup", () => {
  it("sends the message to the group chat", async () => {
    const sendMessage = mock(async () => ({}));
    await notifyGroup({ api: { sendMessage } } as never, "chat-1", "hello");
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });

  it("never throws when Telegram delivery fails", async () => {
    const sendMessage = mock(async () => {
      throw new Error("telegram down");
    });
    await notifyGroup({ api: { sendMessage } } as never, "chat-1", "hello");
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });
});
