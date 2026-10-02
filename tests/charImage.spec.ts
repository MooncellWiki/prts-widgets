import { describe, expect, it } from "vitest";

import { avatar, halfPortrait, onImageError } from "@/utils/charImage";

describe("干员头像 / 半身像", () => {
  const amiya = { zh: "阿米娅", charId: "char_002_amiya" };
  const noId = { zh: "阿米娅", charId: "" };

  it("有游戏内 ID 时从 torappu 取", () => {
    expect(avatar(amiya)).toBe(
      "https://torappu.prts.wiki/assets/char_avatar/char_002_amiya.png",
    );
    expect(halfPortrait(amiya)).toBe(
      "https://torappu.prts.wiki/assets/char_portrait/char_002_amiya_1.png",
    );
  });

  it("没有 ID 时按中文名走 media", () => {
    expect(avatar(noId)).toMatch(
      /^https:\/\/media\.prts\.wiki\/.\/..\/头像_阿米娅\.png$/,
    );
    expect(halfPortrait({ zh: "阿米娅" })).toMatch(
      /^https:\/\/media\.prts\.wiki\/.\/..\/半身像_阿米娅_1\.png$/,
    );
  });

  it("torappu 取不到时换成 media 的同一张并保持可见；media 也取不到才藏掉", () => {
    const box = document.createElement("div");
    const img = document.createElement("img");
    box.append(img);
    box.addEventListener("error", onImageError, true);

    img.src = halfPortrait(amiya);
    img.dispatchEvent(new Event("error"));
    const media = img.src;
    expect(decodeURI(media)).toBe(halfPortrait(noId));
    expect(img.style.visibility).toBe("");

    img.dispatchEvent(new Event("error"));
    expect(img.src).toBe(media);
    expect(img.style.visibility).toBe("hidden");
  });

  it("本来就走 media 的取不到直接藏掉", () => {
    const img = document.createElement("img");
    img.addEventListener("error", onImageError);
    img.src = avatar(noId);
    img.dispatchEvent(new Event("error"));
    expect(img.style.visibility).toBe("hidden");
  });
});
