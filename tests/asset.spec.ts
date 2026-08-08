import { describe, expect, it } from "vitest";

import {
  resolveAssetUrl,
  resolveStoryAssetByKey,
  resolveStoryVideoByKey,
} from "../src/widgets/StoryPlayer/engine/asset";

describe("resolveAssetUrl", () => {
  it("keeps torappu host unchanged", () => {
    const url = resolveAssetUrl(
      "https://torappu.prts.wiki/assets/audio/avg/a.mp3",
    );
    expect(url).toBe("https://torappu.prts.wiki/assets/audio/avg/a.mp3");
  });

  it("keeps arbitrary urls unchanged", () => {
    const raw = "https://torappu.prts.wiki/assets/audio/avg/a.mp3";
    expect(resolveAssetUrl(raw)).toBe(raw);
  });
});

describe("story image resolvers", () => {
  it("resolves plain image key to avg images path", () => {
    expect(resolveStoryAssetByKey("XyZ_01", false)).toBe(
      "https://torappu.prts.wiki/assets/avg/images/xyz_01.png",
    );
  });

  it("resolves background key with bg_ prefix to avg background path", () => {
    expect(resolveStoryAssetByKey("bg_lungmen_n", true)).toBe(
      "https://torappu.prts.wiki/assets/avg/background/bg_lungmen_n.png",
    );
  });

  it("resolves background key without bg_ prefix to avg background path", () => {
    expect(resolveStoryAssetByKey("lungmen_n", true)).toBe(
      "https://torappu.prts.wiki/assets/avg/background/lungmen_n.png",
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
