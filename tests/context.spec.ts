// @vitest-environment node

import { describe, expect, it } from "vitest";

import { normalizeCharacterMap } from "../src/widgets/StoryPlayer/context";

describe("normalizeCharacterMap", () => {
  it("keys the link map by the lowercased base so mixed-case entries resolve", () => {
    const linkMap = normalizeCharacterMap({
      char_259_Jessica_1: {
        array: [
          {
            alias: "",
            group: -1,
            image: "char_259_Jessica_1/1$1",
            name: "1$1",
          },
        ],
        groups: [],
        pos: { x: 0, y: 0 },
        size: { x: 0, y: 0 },
      },
    });

    // resolveCharacterName / resolveCharacterSelection lowercase the story ref
    // before the lookup, so the original-cased key was unreachable.
    expect(Object.keys(linkMap)).toEqual(["char_259_jessica_1"]);
  });

  it("keeps name and image verbatim because they are asset paths", () => {
    const linkMap = normalizeCharacterMap({
      AVG_char_501_Durin_1: {
        array: [
          {
            alias: "",
            group: -1,
            image: "AVG_char_501_Durin_1/AVG_char_501_Durin_1",
            name: "AVG_char_501_Durin_1",
          },
        ],
        groups: [],
        pos: { x: 0, y: 0 },
        size: { x: 0, y: 0 },
      },
    });

    expect(linkMap.avg_char_501_durin_1?.array[0]).toMatchObject({
      image: "AVG_char_501_Durin_1/AVG_char_501_Durin_1",
      name: "AVG_char_501_Durin_1",
    });
  });

  it("preserves face-overlay groups when folding the key", () => {
    const linkMap = normalizeCharacterMap({
      npc_2004_Alty: {
        array: [{ alias: "", face: "npc_2004_Alty/1", group: 0, name: "1$1" }],
        groups: [
          {
            base: "npc_2004_Alty/base",
            faceRect: { h: 80, w: 100, x: 120, y: 40 },
            mode: "face_overlay",
          },
        ],
        pos: { x: 0, y: 0 },
        size: { x: 0, y: 0 },
      },
    });

    expect(linkMap.npc_2004_alty?.groups[0]).toMatchObject({
      base: "npc_2004_Alty/base",
      mode: "face_overlay",
    });
    expect(linkMap.npc_2004_alty?.array[0]).toMatchObject({
      face: "npc_2004_Alty/1",
      name: "1$1",
    });
  });
});
