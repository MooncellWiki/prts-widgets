import { describe, expect, it } from "vitest";

import {
  buildFaceGallery,
  cargoTextPathIn,
  chunk,
  parseCharacterMap,
  resolveCharacterPreview,
  resourceTypeLabel,
  storyResourceImageUrl,
  characterBaseOfListingId,
} from "../src/widgets/StoryAssetExplorer/utils";

describe("resourceTypeLabel", () => {
  it("maps known types to labels", () => {
    expect(resourceTypeLabel("background")).toBe("背景");
    expect(resourceTypeLabel("character")).toBe("角色");
  });

  it("falls back to raw value for unknown types", () => {
    expect(resourceTypeLabel("unknown")).toBe("unknown");
  });
});

describe("storyResourceImageUrl", () => {
  it("routes backgrounds and images to their folders", () => {
    expect(storyResourceImageUrl("background", "bg_indoor_2")).toBe(
      "https://torappu.prts.wiki/assets/avg/background/bg_indoor_2.png",
    );
    expect(storyResourceImageUrl("image", "avg_2_2")).toBe(
      "https://torappu.prts.wiki/assets/avg/images/avg_2_2.png",
    );
  });

  it("routes items into the images folder and encodes slashes", () => {
    expect(storyResourceImageUrl("item", "item_act70_1")).toBe(
      "https://torappu.prts.wiki/assets/avg/images/item_act70_1.png",
    );
    expect(storyResourceImageUrl("image", "pic/avg main_01")).toBe(
      "https://torappu.prts.wiki/assets/avg/images/pic/avg%20main_01.png",
    );
  });

  it("returns null for characters", () => {
    expect(storyResourceImageUrl("character", "avg_npc_009$1")).toBeNull();
  });
});

describe("character preview resolution", () => {
  it("strips face and body suffixes from listing ids", () => {
    expect(characterBaseOfListingId("avg_npc_009$1")).toBe("avg_npc_009");
    expect(characterBaseOfListingId("nobody")).toBe("nobody");
    expect(characterBaseOfListingId("avg_x#3 4$2")).toBe("avg_x");
    expect(characterBaseOfListingId("avg_1038_whitw2_1#10$1")).toBe(
      "avg_1038_whitw2_1",
    );
  });

  it("composites face characters and links single-image characters", () => {
    const links = parseCharacterMap({
      avg_npc_009: {
        groups: [],
        array: [
          { name: "avg_npc_009", group: -1, image: "avg_npc_009/avg_npc_009" },
        ],
      },
      avg_npc_2202_1: {
        groups: [
          {
            mode: "face_overlay",
            base: "avg_npc_2202_1/avg_npc_2202_1$1",
            faceRect: { x: 459, y: 159, w: 130, h: 110 },
          },
        ],
        array: [
          { name: "1$1", group: 0, face: "avg_npc_2202_1/1$1" },
          { name: "2$1", group: 0, face: "avg_npc_2202_1/2$1" },
        ],
      },
    });

    expect(resolveCharacterPreview("avg_npc_009$1", links)).toEqual({
      kind: "single",
      url: "https://torappu.prts.wiki/assets/avg/characters/avg_npc_009/avg_npc_009.png",
    });
    expect(resolveCharacterPreview("avg_npc_2202_1$1", links)).toEqual({
      kind: "composite",
      baseUrl:
        "https://torappu.prts.wiki/assets/avg/characters/avg_npc_2202_1/avg_npc_2202_1%241.png",
      faceUrl:
        "https://torappu.prts.wiki/assets/avg/characters/avg_npc_2202_1/1%241.png",
      faceRect: { x: 459, y: 159, w: 130, h: 110 },
    });
    expect(resolveCharacterPreview("missing$1", links)).toBeNull();
  });

  it("resolves hash-suffixed standalone images exactly", () => {
    const links = parseCharacterMap({
      avg_1038_whitw2_1: {
        groups: [
          {
            mode: "face_overlay",
            base: "avg_1038_whitw2_1/avg_1038_whitw2_1$1",
            faceRect: { x: 787, y: 235, w: 236, h: 228 },
          },
        ],
        array: [
          { name: "1$1", group: 0, face: "avg_1038_whitw2_1/1$1" },
          { name: "10$1", group: -1, image: "avg_1038_whitw2_1/10$1" },
        ],
      },
    });

    expect(resolveCharacterPreview("avg_1038_whitw2_1#10$1", links)).toEqual({
      kind: "single",
      url: "https://torappu.prts.wiki/assets/avg/characters/avg_1038_whitw2_1/10%241.png",
    });
    // 未知差分名退回 body 形态的默认预览
    expect(resolveCharacterPreview("avg_1038_whitw2_1#99$1", links)).toEqual({
      kind: "composite",
      baseUrl:
        "https://torappu.prts.wiki/assets/avg/characters/avg_1038_whitw2_1/avg_1038_whitw2_1%241.png",
      faceUrl:
        "https://torappu.prts.wiki/assets/avg/characters/avg_1038_whitw2_1/1%241.png",
      faceRect: { x: 787, y: 235, w: 236, h: 228 },
    });
  });

  it("picks the overlay group matching the body suffix", () => {
    const links = parseCharacterMap({
      avg_1038_whitw2_1: {
        groups: [
          {
            mode: "face_overlay",
            base: "avg_1038_whitw2_1/avg_1038_whitw2_1$1",
            faceRect: { x: 787, y: 235, w: 236, h: 228 },
          },
          {
            mode: "face_overlay",
            base: "avg_1038_whitw2_1/avg_1038_whitw2_1$2",
            faceRect: { x: 787, y: 234, w: 236, h: 229 },
          },
        ],
        array: [
          { name: "1$1", group: 0, face: "avg_1038_whitw2_1/1$1" },
          { name: "1$2", group: 1, face: "avg_1038_whitw2_1/1$2" },
        ],
      },
    });

    expect(resolveCharacterPreview("avg_1038_whitw2_1$2", links)).toEqual({
      kind: "composite",
      baseUrl:
        "https://torappu.prts.wiki/assets/avg/characters/avg_1038_whitw2_1/avg_1038_whitw2_1%242.png",
      faceUrl:
        "https://torappu.prts.wiki/assets/avg/characters/avg_1038_whitw2_1/1%242.png",
      faceRect: { x: 787, y: 234, w: 236, h: 229 },
    });
  });

  it("builds a face gallery marking the faces a script uses", () => {
    const links = parseCharacterMap({
      avg_1037_amiya3_1: {
        groups: [
          {
            mode: "face_overlay",
            base: "avg_1037_amiya3_1/avg_1037_amiya3_1$1",
            faceRect: { x: 100, y: 200, w: 80, h: 90 },
          },
        ],
        array: [
          { name: "1$1", group: 0, face: "avg_1037_amiya3_1/1$1" },
          { name: "2$1", group: 0, face: "avg_1037_amiya3_1/2$1" },
          { name: "10$1", group: 0, face: "avg_1037_amiya3_1/10$1" },
        ],
      },
    });

    const gallery = buildFaceGallery(
      "avg_1037_amiya3_1$1",
      ["avg_1037_amiya3_1#1$1", "avg_1037_amiya3_1#10$1"],
      links,
    );
    expect(gallery?.map((face) => [face.expression, face.used])).toEqual([
      ["1$1", true],
      ["2$1", false],
      ["10$1", true],
    ]);
    expect(gallery?.[0].baseUrl).toBe(
      "https://torappu.prts.wiki/assets/avg/characters/avg_1037_amiya3_1/avg_1037_amiya3_1%241.png",
    );

    // 单图角色与未知角色没有表情差分
    const singleLinks = parseCharacterMap({
      avg_npc_009: {
        groups: [],
        array: [
          { name: "avg_npc_009", group: -1, image: "avg_npc_009/avg_npc_009" },
        ],
      },
    });
    expect(
      buildFaceGallery("avg_npc_009$1", ["avg_npc_009#1$1"], singleLinks),
    ).toBeNull();
    expect(buildFaceGallery("missing$1", [], links)).toBeNull();
  });

  it("limits the face gallery to the queried body", () => {
    const links = parseCharacterMap({
      avg_1038_whitw2_1: {
        groups: [
          {
            mode: "face_overlay",
            base: "avg_1038_whitw2_1/avg_1038_whitw2_1$1",
            faceRect: { x: 787, y: 235, w: 236, h: 228 },
          },
          {
            mode: "face_overlay",
            base: "avg_1038_whitw2_1/avg_1038_whitw2_1$2",
            faceRect: { x: 787, y: 234, w: 236, h: 229 },
          },
        ],
        array: [
          { name: "1$1", group: 0, face: "avg_1038_whitw2_1/1$1" },
          { name: "2$1", group: 0, face: "avg_1038_whitw2_1/2$1" },
          { name: "1$2", group: 1, face: "avg_1038_whitw2_1/1$2" },
        ],
      },
    });

    const gallery = buildFaceGallery(
      "avg_1038_whitw2_1$2",
      ["avg_1038_whitw2_1#1$2"],
      links,
    );
    expect(gallery?.map((face) => [face.expression, face.used])).toEqual([
      ["1$2", true],
    ]);
    expect(gallery?.[0].baseUrl).toBe(
      "https://torappu.prts.wiki/assets/avg/characters/avg_1038_whitw2_1/avg_1038_whitw2_1%242.png",
    );
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
