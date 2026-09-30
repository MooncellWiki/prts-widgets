import { describe, expect, it } from "vitest";

import {
  buildTagStyles,
  parseRichChars,
  richCharsToTaggedText,
} from "../src/widgets/StoryPlayer/engine/richtext";

const plain = (text: string): string =>
  parseRichChars(text)
    .map(({ char }) => char)
    .join("");

describe("parseRichChars", () => {
  it("treats <b>, <i> and <color> as zero-width style spans", () => {
    const chars = parseRichChars(
      "<i>罗比</i>：<b>粗</b><color=#d41f1f>红</color>",
    );
    expect(chars.map(({ char }) => char).join("")).toBe("罗比：粗红");
    expect(chars).toEqual([
      { bold: false, char: "罗", color: null, italic: true },
      { bold: false, char: "比", color: null, italic: true },
      { bold: false, char: "：", color: null, italic: false },
      { bold: true, char: "粗", color: null, italic: false },
      { bold: false, char: "红", color: "#d41f1f", italic: false },
    ]);
  });

  it("nests spans the way the corpus does (<color> around <i>)", () => {
    expect(parseRichChars("<color=#000000><i>a</i>b</color>")).toEqual([
      { bold: false, char: "a", color: "#000000", italic: true },
      { bold: false, char: "b", color: "#000000", italic: false },
    ]);
    // The innermost color wins.
    expect(
      parseRichChars("<color=#111111>a<color=#222222>b</color>c</color>").map(
        ({ color }) => color,
      ),
    ).toEqual(["#111111", "#222222", "#111111"]);
  });

  it("keeps unpaired tags, unsupported tags and non-hex colors literal", () => {
    expect(plain("<i>unclosed")).toBe("<i>unclosed");
    expect(plain("stray</b>")).toBe("stray</b>");
    expect(plain("<size=20>大</size>")).toBe("<size=20>大</size>");
    expect(plain("<color=red>红</color>")).toBe("<color=red>红</color>");
  });

  it("matches tag names case-insensitively", () => {
    expect(parseRichChars("<I>a</I><COLOR=#ff0000>b</COLOR>")).toEqual([
      { bold: false, char: "a", color: null, italic: true },
      { bold: false, char: "b", color: "#ff0000", italic: false },
    ]);
  });
});

describe("richCharsToTaggedText", () => {
  it("wraps each style run in nested tags whose styles buildTagStyles provides", () => {
    const chars = parseRichChars("x<b><i>y<color=#ff0000>z</color></i></b>");
    expect(richCharsToTaggedText(chars)).toBe(
      "x<_b><_i>y</_i></_b><_b><_i><_cff0000>z</_cff0000></_i></_b>",
    );
    expect(buildTagStyles(chars)).toEqual({
      _b: { fontWeight: "bold" },
      _cff0000: { fill: "#ff0000" },
      _i: { fontStyle: "italic" },
    });
    expect(buildTagStyles(parseRichChars("plain"))).toEqual({});
  });

  it("keeps every typing prefix balanced", () => {
    const chars = parseRichChars("<i>ab</i>c");
    expect(richCharsToTaggedText(chars.slice(0, 1))).toBe("<_i>a</_i>");
    expect(richCharsToTaggedText(chars.slice(0, 3))).toBe("<_i>ab</_i>c");
    expect(richCharsToTaggedText([])).toBe("");
  });
});
