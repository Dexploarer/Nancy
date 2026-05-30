import { describe, expect, it } from "bun:test";
import { normalizeLanguages } from "../src/domain/languages.js";

describe("normalizeLanguages", () => {
  it("filters invalid codes and dedupes", () => {
    expect(normalizeLanguages(["en", "xx", "zh", "en"])).toEqual(["en", "zh"]);
  });

  it("returns ['en'] when input is empty", () => {
    expect(normalizeLanguages([])).toEqual(["en"]);
  });

  it("returns ['en'] when all codes are invalid", () => {
    expect(normalizeLanguages(["xx", "yy", "zz"])).toEqual(["en"]);
  });
});
