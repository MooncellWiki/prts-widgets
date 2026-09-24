import { describe, expect, it } from "vitest";

import {
  parseLine,
  parseScript,
  parseStory,
} from "../src/widgets/StoryPlayer/engine/parser";

describe("parser", () => {
  it("parses command line with args and trailing text", () => {
    expect(parseLine('[multiline(name="卢西恩",end=true)]她自己。')).toEqual({
      args: { end: true, name: "卢西恩" },
      command: "multiline",
      content: "她自己。",
      kind: "command",
      lineNumber: 1,
      paramPresent: true,
      raw: '[multiline(name="卢西恩",end=true)]她自己。',
      trailingText: "她自己。",
    });
  });

  it("parses dialogue line", () => {
    expect(
      parseLine(
        '[name="剧团长"]如若你是指自己解决了那个名叫莫伊拉的孩子......',
      ),
    ).toEqual({
      kind: "dialogue",
      lineNumber: 1,
      raw: '[name="剧团长"]如若你是指自己解决了那个名叫莫伊拉的孩子......',
      speaker: "剧团长",
      text: "如若你是指自己解决了那个名叫莫伊拉的孩子......",
    });
  });

  it("appends the generated endtip command", () => {
    const input = ["[dialog]", "文本"];
    const output = parseScript(input);
    expect(output).toHaveLength(3);
    expect(output[0].kind).toBe("command");
    expect(output[1].kind).toBe("narration");
    // The implicit endtip reuses the last source line's number.
    expect(output[2]).toEqual({
      args: { block: true },
      command: "endtip",
      content: "",
      kind: "command",
      lineNumber: 2,
      paramPresent: true,
      raw: "[endtip(block=true)]",
      trailingText: "",
    });
  });

  it("joins continuations before filtering comments and blank lines", () => {
    const output = parseScript(
      '[Character(name="a",\\\n xScale=1.2)]\n // comment\n\ntext',
    );
    expect(output).toHaveLength(3);
    expect(output[0]).toMatchObject({
      args: { name: "a", xScale: 1.2 },
      kind: "command",
      lineNumber: 1,
      raw: '[Character(name="a", xScale=1.2)]',
    });
    expect(output[1]).toMatchObject({
      kind: "narration",
      lineNumber: 5,
      text: "text",
    });
  });

  it("normalizes command names but preserves parameter key casing", () => {
    const line = parseLine("[BackgroundTween(xScaleFrom=1.2,xscale=2)]");
    expect(line).toMatchObject({
      args: { xScaleFrom: 1.2, xscale: 2 },
      command: "backgroundtween",
      kind: "command",
    });
  });

  it("parses unbracketed text as narration with whitespace preserved", () => {
    const line = parseLine("   ......好热......  ");
    expect(line).toMatchObject({
      kind: "narration",
      text: "   ......好热......  ",
    });
  });

  it("extracts header metadata without consuming the header command", () => {
    // The story id comes from `key`; `id` is not a HEADER param at all.
    const story = parseStory(
      '[HEADER(key="x",fit_mode="BLACK_MASK",is_video_only=true)] T',
    );
    expect(story.metadata).toEqual({
      args: { fit_mode: "BLACK_MASK", is_video_only: true, key: "x" },
      characterSortType: "BY_GAIN_TIME_DOWN",
      denyAutoSwitchScene: false,
      dontClearGameObjectPoolOnStart: false,
      fitMode: "BLACK_MASK",
      id: "x",
      // Video-only stories are not autoable unless is_autoable says so.
      isAutoable: false,
      isSkippable: true,
      isTutorial: false,
      isVideoOnly: true,
      title: "T",
    });
    expect(story.lines[0]).toMatchObject({
      command: "header",
      kind: "command",
    });
  });

  it("ignores a HEADER id param", () => {
    const story = parseStory('[HEADER(id="x")] T');
    expect(story.metadata.id).toBe("");
  });
});
