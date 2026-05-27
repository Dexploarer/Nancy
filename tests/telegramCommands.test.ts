import { describe, expect, it } from "bun:test";
import { BOT_COMMANDS } from "../src/bot/telegramCommands.js";

describe("BOT_COMMANDS", () => {
  it("registers the group Safe setup commands in Telegram", () => {
    const commands = BOT_COMMANDS.map((command) => command.command);

    expect(commands).toContain("safe_group");
    expect(commands).toContain("safe_group_join");
    expect(commands).toContain("safe_create");
    expect(commands).toContain("buy");
    expect(commands).toContain("flap_launch");
  });
});
