import { describe, expect, it } from "vitest";

import { tryParseEnum } from "@/widgets/StoryPlayer/engine/commandParams";

enum Members {
  None = 0,
  First = 1,
  Second = 2,
  SignBit = -2147483648,
}

describe("2791 System.Enum.TryParseEnum", () => {
  it.each([
    ["+0006", 6],
    ["-0", 0],
    ["-2147483648", -2147483648],
    ["2147483647", 2147483647],
    ["-2147483649", null],
    ["2147483648", null],
    ["\u0085+6\u00a0", 6],
    ["6 \0\0", 6],
    ["6\0 0", null],
    ["6\u00a0\0", null],
    ["\ufeff6", null],
    [null, null],
    [undefined, null],
    ["\u0085", null],
  ] as const)("parses an Int32 ordinal from %j", (text, value) => {
    expect(tryParseEnum(text, Members)).toBe(value);
  });

  it("tries names after a format error, but stops on numeric overflow", () => {
    const members = { "3D": 1, "6": 2, "2147483648": 4, Second: 8 };
    expect(tryParseEnum("3D", members)).toBe(1);
    expect(tryParseEnum("6", members)).toBe(6);
    expect(tryParseEnum("6,Second", members)).toBe(10);
    expect(tryParseEnum("2147483648", members)).toBeNull();
  });

  it("trims and ORs named values even on an enum without Flags", () => {
    expect(tryParseEnum("None", Members)).toBe(0);
    expect(tryParseEnum("First,\u0085Second\u3000, First", Members)).toBe(3);
    expect(tryParseEnum("SignBit,First", Members)).toBe(-2147483647);
    for (const text of [
      "1,Second",
      "First,",
      ",First",
      "First,,Second",
      "First,Missing",
      "First\0",
      "First\ufeff",
      "toString",
    ]) {
      expect(tryParseEnum(text, Members)).toBeNull();
    }
  });

  it("only folds case when requested, using the 2791 ordinal comparison", () => {
    expect(tryParseEnum("first,SECOND", Members)).toBeNull();
    expect(tryParseEnum("first,SECOND", Members, true)).toBe(3);
    for (const text of ["Fırst", "Firſt"]) {
      expect(tryParseEnum(text, Members, true)).toBeNull();
    }
    const aliases = { Value: -1, VALUE: 7, value: 2 };
    expect(tryParseEnum("VALUE", aliases, true)).toBe(2);
    expect(tryParseEnum("VALUE", aliases)).toBe(7);
  });
});
