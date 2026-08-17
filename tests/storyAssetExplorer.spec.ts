import { describe, expect, it } from "vitest";

import {
  cargoTextPathIn,
  chunk,
  normalizeCharacterId,
} from "../src/widgets/StoryAssetExplorer/utils";

describe("normalizeCharacterId", () => {
  it("appends default face and body", () => {
    expect(normalizeCharacterId("avg_npc_009")).toBe("avg_npc_009#1$1");
    expect(normalizeCharacterId("char_220_grani#5")).toBe("char_220_grani#5$1");
    expect(normalizeCharacterId("avg_1014_nearl2_1#2$2")).toBe(
      "avg_1014_nearl2_1#2$2",
    );
  });

  it("returns empty string for blank input", () => {
    expect(normalizeCharacterId("")).toBe("");
    expect(normalizeCharacterId(" ".repeat(3))).toBe("");
  });

  it("absorbs whitespace around suffixes", () => {
    expect(normalizeCharacterId("avg_npc_366_1#1$1 ")).toBe(
      "avg_npc_366_1#1$1",
    );
    expect(normalizeCharacterId("avg_4236_tmslot_1#3 $1")).toBe(
      "avg_4236_tmslot_1#3$1",
    );
    expect(normalizeCharacterId("avg_4236_tmslot_1# 3")).toBe(
      "avg_4236_tmslot_1#3$1",
    );
  });

  it("keeps unparsable suffix in base", () => {
    expect(normalizeCharacterId("avg_x#3 4$1")).toBe("avg_x#3 4#1$1");
  });
});

describe("chunk", () => {
  it("splits list into fixed-size groups", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 100)).toEqual([]);
  });
});

describe("cargoTextPathIn", () => {
  it("builds IN clause", () => {
    expect(cargoTextPathIn(["a", "b"])).toBe('textPath IN ("a","b")');
  });

  it("escapes quotes and backslashes", () => {
    expect(cargoTextPathIn(['a"b', String.raw`c\d`])).toBe(
      String.raw`textPath IN ("a\"b","c\\d")`,
    );
  });
});
