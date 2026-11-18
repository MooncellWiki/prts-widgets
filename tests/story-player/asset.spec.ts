import { describe, expect, it } from "vitest";

import {
  resolveAssetUrl,
  resolveStoryAssetByKey,
  resolveStoryVideoByKey,
} from "../../src/widgets/StoryPlayer/engine/asset";

describe("resolveAssetUrl", () => {
  it("keeps torappu host unchanged", () => {
    const url = resolveAssetUrl(
      "https://torappu.prts.wiki/assets/audio/avg/a.mp3",
    );
    expect(url).toBe("https://torappu.prts.wiki/assets/audio/avg/a.mp3");
  });
});

describe("story image resolvers", () => {
  it("resolves plain image key to avg images path", () => {
    expect(resolveStoryAssetByKey("XyZ_01", "image")).toBe(
      "https://torappu.prts.wiki/assets/avg/images/xyz_01.png",
    );
  });

  it.each([
    {
      expected:
        "https://torappu.prts.wiki/assets/avg/background/bg_lungmen_n.png",
      key: "bg_lungmen_n",
      name: "with",
    },
    {
      expected: "https://torappu.prts.wiki/assets/avg/background/lungmen_n.png",
      key: "lungmen_n",
      name: "without",
    },
  ])(
    "resolves background key $name bg_ prefix to avg background path",
    ({ expected, key }) => {
      expect(resolveStoryAssetByKey(key, "background")).toBe(expected);
    },
  );

  it("resolves cutin key to avg cutin path", () => {
    expect(resolveStoryAssetByKey("cutin_char_9", "cutin")).toBe(
      "https://torappu.prts.wiki/assets/avg/cutin/cutin_char_9.png",
    );
  });
});

describe("cutin bundle paths", () => {
  it.each([
    ["CUTIN_CHAR_21#1", "cutin_char_21%231"],
    ["CUTIN_CHAR_21@A", "cutin_char_21%40a"],
    ["Cutin_Char_21.PNG", "cutin_char_21"],
    [" Cutin_Char_21 ", "%20cutin_char_21%20"],
  ])("uses the native bundle key for %s", (raw, path) => {
    expect(resolveStoryAssetByKey(raw, "cutin")).toBe(
      `https://torappu.prts.wiki/assets/avg/cutin/${path}.png`,
    );
  });
});

describe("story video resolver", () => {
  it("resolves relative video paths from the shared assets root", () => {
    expect(resolveStoryVideoByKey("video/Act15Side/IW01.mp4")).toBe(
      "https://torappu.prts.wiki/assets/video/act15side/iw01.mp4",
    );
  });
});
