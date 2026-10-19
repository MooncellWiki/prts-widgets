// @vitest-environment node

import { describe, expect, it } from "vitest";

import {
  nativeCharacterFadeIdentity,
  parseNativeCharacterRef,
  resolveCharacterRef,
  resolveCharacterSelection,
  tryParseInt32,
} from "../src/widgets/StoryPlayer/engine/characterRef";

import type { StoryLinkNode } from "../src/widgets/StoryPlayer/engine/types";

const linkMap: Record<string, StoryLinkNode> = {
  avg_npc_1: {
    array: [
      { alias: "angry", group: -1, image: "avg_npc_1/1$1", name: "1$1" },
      { alias: "calm", group: -1, image: "avg_npc_1/2$1", name: "2$1" },
      { alias: "", group: -1, image: "avg_npc_1/1$2", name: "1$2" },
      { alias: "", group: -1, image: "avg_npc_1/2$2", name: "2$2" },
    ],
    groups: [],
    pos: { x: 0, y: 0 },
    size: { x: 0, y: 0 },
  },
};

describe("tryParseInt32", () => {
  it("accepts the whitespace .NET's number parser accepts", () => {
    // Number.IsWhite: 0x20 and 0x09..0x0D.
    for (const pad of [" ", "\t", "\n", "\r", "\v", "\f"]) {
      expect(tryParseInt32(`${pad}3`)).toBe(3);
      expect(tryParseInt32(`3${pad}`)).toBe(3);
    }
  });

  it("rejects whitespace .NET does not treat as whitespace", () => {
    // JS \s matches these, which is exactly why the old regex over-tolerated.
    expect(tryParseInt32("3 ")).toBeNull(); // NBSP
    expect(tryParseInt32("　3")).toBeNull(); // ideographic space
    expect(tryParseInt32("3﻿")).toBeNull(); // BOM
  });

  it("accepts a leading sign", () => {
    expect(tryParseInt32("+3")).toBe(3);
    expect(tryParseInt32("-3")).toBe(-3);
    expect(tryParseInt32(" +3 ")).toBe(3);
  });

  it("fails on Int32 overflow like TryParse does", () => {
    expect(tryParseInt32("2147483647")).toBe(2147483647);
    expect(tryParseInt32("-2147483648")).toBe(-2147483648);
    expect(tryParseInt32("2147483648")).toBeNull();
    expect(tryParseInt32("99999999999")).toBeNull();
  });

  it("rejects anything that is not exactly one integer", () => {
    for (const bad of ["", " ", "abc", "1#3", "3.5", "3 4", "1,000"])
      expect(tryParseInt32(bad)).toBeNull();
  });
});

describe("nativeCharacterFadeIdentity", () => {
  it("strips alias/index suffixes but preserves a standalone body suffix", () => {
    expect(nativeCharacterFadeIdentity("avg_npc_1#3$2")).toBe("avg_npc_1");
    expect(nativeCharacterFadeIdentity("avg_npc_1@angry$2")).toBe("avg_npc_1");
    expect(nativeCharacterFadeIdentity("avg_npc_1$2")).toBe("avg_npc_1$2");
  });
});

describe("parseNativeCharacterRef", () => {
  it("parses the plain suffix forms", () => {
    expect(parseNativeCharacterRef("avg_npc_1")).toEqual({
      alias: null,
      base: "avg_npc_1",
      group: null,
      index: 0,
    });
    expect(parseNativeCharacterRef("avg_npc_1#3")).toEqual({
      alias: null,
      base: "avg_npc_1",
      group: null,
      index: 2,
    });
    expect(parseNativeCharacterRef("avg_npc_1$2")).toEqual({
      alias: null,
      base: "avg_npc_1",
      group: 1,
      index: 0,
    });
    expect(parseNativeCharacterRef("avg_npc_1#3$2")).toEqual({
      alias: null,
      base: "avg_npc_1",
      group: 1,
      index: 2,
    });
  });

  it("absorbs whitespace inside the suffix, as Int32.TryParse does", () => {
    // The one real-world case: level_act53side_03_end.txt.
    expect(parseNativeCharacterRef("avg_4236_tmslot_1#3 $1")).toEqual({
      alias: null,
      base: "avg_4236_tmslot_1",
      group: 0,
      index: 2,
    });
    expect(parseNativeCharacterRef("avg_npc_1# 3")).toEqual({
      alias: null,
      base: "avg_npc_1",
      group: null,
      index: 2,
    });
    expect(parseNativeCharacterRef("avg_npc_1$ 2")).toEqual({
      alias: null,
      base: "avg_npc_1",
      group: 1,
      index: 0,
    });
  });

  // The four cases below are the reason this is a loop and not a regex: a
  // single anchored alternation cannot express independent right-to-left strips.
  it("strips both an alias and a group, in that order", () => {
    expect(parseNativeCharacterRef("avg_npc_1@angry$2")).toEqual({
      alias: "@angry",
      base: "avg_npc_1",
      group: 1,
      index: 0,
    });
  });

  it("leaves an unparseable $ segment on the base and still strips #", () => {
    expect(parseNativeCharacterRef("avg_npc_1$1#3")).toEqual({
      alias: null,
      base: "avg_npc_1$1",
      group: null,
      index: 2,
    });
  });

  it("leaves an overflowing index on the base", () => {
    expect(parseNativeCharacterRef("avg_npc_1#99999999999")).toEqual({
      alias: null,
      base: "avg_npc_1#99999999999",
      group: null,
      index: 0,
    });
  });

  it("accepts a signed index", () => {
    expect(parseNativeCharacterRef("avg_npc_1#+3")).toEqual({
      alias: null,
      base: "avg_npc_1",
      group: null,
      index: 2,
    });
  });

  it("leaves a non-numeric # segment on the base", () => {
    expect(parseNativeCharacterRef("avg_npc_1#abc")).toEqual({
      alias: null,
      base: "avg_npc_1#abc",
      group: null,
      index: 0,
    });
  });

  it("keeps the leading @ on the alias, like _TryParseAlias", () => {
    expect(parseNativeCharacterRef("avg_npc_1@angry")).toEqual({
      alias: "@angry",
      base: "avg_npc_1",
      group: null,
      index: 0,
    });
  });

  it("returns null only for an empty ref", () => {
    expect(parseNativeCharacterRef("")).toBeNull();
  });
});

describe("resolveCharacterSelection", () => {
  it("picks by index when there is no group", () => {
    expect(resolveCharacterSelection(linkMap, "avg_npc_1#2")).toEqual({
      base: "avg_npc_1",
      expression: "2$1",
    });
  });

  it("picks the nth entry within a group", () => {
    expect(resolveCharacterSelection(linkMap, "avg_npc_1#2$2")).toEqual({
      base: "avg_npc_1",
      expression: "2$2",
    });
  });

  it("takes the first of a group when only $N is given", () => {
    expect(resolveCharacterSelection(linkMap, "avg_npc_1$2")).toEqual({
      base: "avg_npc_1",
      expression: "1$2",
    });
  });

  it("folds case, standing in for _PreprocessAssetPath's ToLower", () => {
    expect(resolveCharacterSelection(linkMap, "AVG_NPC_1#2")).toEqual({
      base: "avg_npc_1",
      expression: "2$1",
    });
  });

  it("resolves an alias, deliberately diverging from native", () => {
    // Native compares the "@"-prefixed string against the bare stored alias, so
    // it always misses and falls back to sprites[0]. We match instead.
    expect(resolveCharacterSelection(linkMap, "avg_npc_1@calm")).toEqual({
      base: "avg_npc_1",
      expression: "2$1",
    });
  });

  it("falls back to the first entry for an unknown alias", () => {
    expect(resolveCharacterSelection(linkMap, "avg_npc_1@nope")).toEqual({
      base: "avg_npc_1",
      expression: "1$1",
    });
  });

  it("returns null for an unknown base, an empty group, or an empty ref", () => {
    expect(resolveCharacterSelection(linkMap, "avg_npc_404")).toBeNull();
    expect(resolveCharacterSelection(linkMap, "avg_npc_1$9")).toBeNull();
    expect(resolveCharacterSelection(linkMap, "")).toBeNull();
  });
});

describe("resolveCharacterSelection with body/index slots", () => {
  // Shaped after avg_npc_1898_1: its faces are named `2$1.` and so on, so
  // the `$N` name suffix misses them, and the face hub's base sprite (body 0,
  // index 3) is drawn under the faces rather than listed.
  const slotted: Record<string, StoryLinkNode> = {
    avg_npc_9: {
      array: [
        {
          alias: "",
          body: 0,
          face: "avg_npc_9/1$1",
          group: 0,
          index: 0,
          name: "1$1",
        },
        {
          alias: "",
          body: 0,
          face: "avg_npc_9/2$1.",
          group: 0,
          index: 1,
          name: "2$1.",
        },
        {
          alias: "",
          body: 0,
          face: "avg_npc_9/3$1.",
          group: 0,
          index: 2,
          name: "3$1.",
        },
        {
          alias: "",
          body: 1,
          group: -1,
          image: "avg_npc_9/1$2",
          index: 0,
          name: "1$2",
        },
        {
          alias: "",
          body: 1,
          group: -1,
          image: "avg_npc_9/2$2",
          index: 1,
          name: "2$2",
        },
      ],
      groups: [
        {
          base: "avg_npc_9/4$1",
          faceRect: { h: 10, w: 10, x: 0, y: 0 },
          mode: "face_overlay",
        },
      ],
      pos: { x: 0, y: 0 },
      size: { x: 0, y: 0 },
    },
  };
  const pick = (ref: string) =>
    resolveCharacterSelection(slotted, ref)?.expression;

  it("picks spriteGroups[body].sprites[index] whatever the names end with", () => {
    expect(pick("avg_npc_9#3$1")).toBe("3$1.");
    expect(pick("avg_npc_9#2$2")).toBe("2$2");
    expect(pick("avg_npc_9$2")).toBe("1$2");
  });

  it("uses body 0 when the ref has no $N, as _LoadImage does", () => {
    expect(pick("avg_npc_9#2")).toBe("2$1.");
  });

  it("falls back to body 0 for a body the hub does not have", () => {
    expect(pick("avg_npc_9#2$9")).toBe("2$1.");
  });

  it("falls back to the body's first entry for a slot it does not list", () => {
    expect(pick("avg_npc_9#4$1")).toBe("1$1");
    expect(pick("avg_npc_9#9$2")).toBe("1$2");
  });
});

describe("resolveCharacterRef with bodies", () => {
  // Body 0: faces at 0 and 1, the face hub's base sprite at 2 (unlisted), so
  // sprites.Length is 3. Body 1: one whole-body image, Length 1. Body 2: an
  // empty group.
  const hub: Record<string, StoryLinkNode> = {
    avg_npc_9: {
      array: [
        {
          alias: "",
          body: 0,
          face: "avg_npc_9/1$1",
          group: 0,
          index: 0,
          name: "1$1",
        },
        {
          alias: "",
          body: 0,
          face: "avg_npc_9/2$1",
          group: 0,
          index: 1,
          name: "2$1",
        },
        {
          alias: "",
          body: 1,
          group: -1,
          image: "avg_npc_9/1$2",
          index: 0,
          name: "1$2",
        },
      ],
      bodies: [3, 1, 0],
      groups: [
        {
          base: "avg_npc_9/avg_npc_9$1",
          faceRect: { h: 10, w: 10, x: 0, y: 0 },
          mode: "face_overlay",
        },
      ],
      pos: { x: 0, y: 0 },
      size: { x: 0, y: 0 },
    },
  };
  const kind = (ref: string) => resolveCharacterRef(hub, ref).kind;

  it("throws exactly at sprites.Length, falls back to 0 past it", () => {
    expect(kind("avg_npc_9#3$1")).toBe("found"); // the base sprite slot
    expect(kind("avg_npc_9#4$1")).toBe("native_throws");
    expect(resolveCharacterSelection(hub, "avg_npc_9#5$1")?.expression).toBe(
      "1$1",
    );
    expect(kind("avg_npc_9#2$2")).toBe("native_throws");
    expect(kind("avg_npc_9#3$2")).toBe("found");
  });

  it("throws exactly at spriteGroups.Length, falls back to body 0 past it", () => {
    expect(kind("avg_npc_9#1$4")).toBe("native_throws");
    expect(resolveCharacterSelection(hub, "avg_npc_9#2$5")?.expression).toBe(
      "2$1",
    );
    expect(resolveCharacterSelection(hub, "avg_npc_9#2$0")?.expression).toBe(
      "2$1",
    );
  });

  it("throws for any index into an empty body", () => {
    expect(kind("avg_npc_9#1$3")).toBe("native_throws");
    expect(kind("avg_npc_9#0$3")).toBe("native_throws");
    expect(kind("avg_npc_9$3")).toBe("native_throws");
  });

  it("checks the bare key and the @alias form against body 0 / sprites[0]", () => {
    expect(kind("avg_npc_9")).toBe("found");
    expect(kind("avg_npc_9@smile$3")).toBe("native_throws");
    expect(kind("avg_npc_9@smile$2")).toBe("found");
  });

  it("returns null from resolveCharacterSelection when native throws", () => {
    expect(resolveCharacterSelection(hub, "avg_npc_9#4$1")).toBeNull();
  });

  it("keeps the old fallbacks when bodies is absent", () => {
    const { bodies: _, ...withoutBodies } = hub.avg_npc_9!;
    const legacy = { avg_npc_9: withoutBodies };
    expect(resolveCharacterRef(legacy, "avg_npc_9#4$1")).toEqual({
      kind: "found",
      selection: { base: "avg_npc_9", expression: "1$1" },
    });
    expect(resolveCharacterRef(legacy, "avg_ghost#1")).toEqual({
      kind: "missing",
    });
  });
});
