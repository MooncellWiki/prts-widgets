// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

import { preloadContextAssets } from "../src/widgets/StoryPlayer/engine/preload";

import type { Context } from "../src/widgets/StoryPlayer/context";

const { loadMock } = vi.hoisted(() => ({
  // 对齐 pixi v8 Assets.load 第二参数签名:可以是裸 progress 回调,也可以是
  // LoadOptions({ onProgress, onError, ... })。两种都从 onProgress 求值。
  loadMock: vi.fn(
    async (
      urls: string[],
      onProgressOrOptions?:
        | ((progress: number) => void)
        | { onProgress?: (progress: number) => void },
    ) => {
      const cb =
        typeof onProgressOrOptions === "function"
          ? onProgressOrOptions
          : onProgressOrOptions?.onProgress;
      cb?.(1);
      return urls;
    },
  ),
}));

vi.mock("pixi.js", () => ({
  Assets: {
    load: loadMock,
  },
}));

function createContext(script: readonly string[]): Context {
  return {
    audioVariables: {},
    linkMap: {
      avg_1012_skadisp_1: {
        array: [
          {
            alias: "",
            group: -1,
            image: "avg_1012_skadisp_1/avg_1012_skadisp_1",
            name: "avg_1012_skadisp_1",
          },
          {
            alias: "",
            group: -1,
            image: "avg_1012_skadisp_1/avg_1012_skadisp_2",
            name: "avg_1012_skadisp_2",
          },
        ],
        groups: [],
        pos: { x: 0, y: 0 },
        size: { x: 0, y: 0 },
      },
      avg_npc_180: {
        array: [
          {
            alias: "",
            group: -1,
            image: "avg_npc_180/avg_npc_180_1",
            name: "avg_npc_180_1",
          },
          {
            alias: "",
            group: -1,
            image: "avg_npc_180/avg_npc_180_2",
            name: "avg_npc_180_2",
          },
          {
            alias: "",
            group: -1,
            image: "avg_npc_180/avg_npc_180_3",
            name: "avg_npc_180_3",
          },
        ],
        groups: [],
        pos: { x: 0, y: 0 },
        size: { x: 0, y: 0 },
      },
      char_empty: {
        array: [
          {
            alias: "",
            group: -1,
            image: "char_empty/char_empty",
            name: "char_empty",
          },
        ],
        groups: [],
        pos: { x: 0, y: 0 },
        size: { x: 0, y: 0 },
      },
    },
    script,
  };
}

describe("preloadContextAssets", () => {
  beforeEach(() => {
    loadMock.mockClear();
  });

  it("preloads character command portraits using case-insensitive refs", async () => {
    const progress = vi.fn();
    const context = createContext([
      '[character(name="avg_1012_skadiSP_1#2",name2="char_empty")]',
      '[charslot(slot="m",name="avg_npc_180#3")]',
    ]);

    await preloadContextAssets(context, progress);

    expect(loadMock).toHaveBeenCalledTimes(1);
    expect(loadMock.mock.calls[0]?.[0]).toEqual(
      expect.arrayContaining([
        "https://torappu.prts.wiki/assets/avg/characters/avg_1012_skadisp_1/avg_1012_skadisp_2.png",
        "https://torappu.prts.wiki/assets/avg/characters/char_empty/char_empty.png",
        "https://torappu.prts.wiki/assets/avg/characters/avg_npc_180/avg_npc_180_3.png",
      ]),
    );
    expect(progress).toHaveBeenCalledWith(1);
  });

  it("preloads background command images as background assets", async () => {
    const context = createContext(['[background(image="bg_rhodes_day")]']);

    await preloadContextAssets(context);

    expect(loadMock.mock.calls[0]?.[0]).toEqual(
      expect.arrayContaining([
        "https://torappu.prts.wiki/assets/avg/background/bg_rhodes_day.png",
      ]),
    );
  });

  it("preloads avgdisplay bg content as a background asset", async () => {
    const context = createContext([
      '[avgdisplay(id="1",style="bg",name="bg_black",slot="bgover")]',
      '[avgdisplay(id="1")]',
    ]);

    await preloadContextAssets(context);

    expect(loadMock.mock.calls[0]?.[0]).toEqual(
      expect.arrayContaining([
        "https://torappu.prts.wiki/assets/avg/background/bg_black.png",
      ]),
    );
  });

  it("preloads gridbg tiles as background assets", async () => {
    const context = createContext([
      '[gridbg(imagegroup="47_g14_skyovercast_L1/47_g14_skyovercast_R1/47_g14_skyovercast_L2/47_g14_skyovercast_R2",solidwidth="1280/1280/1280/1280",solidheight="720/720/720/720")]',
    ]);

    await preloadContextAssets(context);

    expect(loadMock).toHaveBeenCalledTimes(1);
    expect(loadMock.mock.calls[0]?.[0]).toEqual(
      expect.arrayContaining([
        "https://torappu.prts.wiki/assets/avg/background/47_g14_skyovercast_l1.png",
        "https://torappu.prts.wiki/assets/avg/background/47_g14_skyovercast_r1.png",
        "https://torappu.prts.wiki/assets/avg/background/47_g14_skyovercast_l2.png",
        "https://torappu.prts.wiki/assets/avg/background/47_g14_skyovercast_r2.png",
      ]),
    );
  });

  it("preloads verticalbg cggroup tiles as image assets", async () => {
    const context = createContext([
      '[verticalbg(cggroup="69_i12_1/69_i12_2",solidwidth="1600",solidheight="900/900")]',
    ]);

    await preloadContextAssets(context);

    expect(loadMock).toHaveBeenCalledTimes(1);
    expect(loadMock.mock.calls[0]?.[0]).toEqual(
      expect.arrayContaining([
        "https://torappu.prts.wiki/assets/avg/images/69_i12_1.png",
        "https://torappu.prts.wiki/assets/avg/images/69_i12_2.png",
      ]),
    );
  });

  it("prefers imagegroup background tiles when verticalbg also includes cggroup", async () => {
    const context = createContext([
      '[verticalbg(imagegroup="47_g14_skyovercast_L1/47_g14_skyovercast_R1",cggroup="69_i12_1/69_i12_2",solidwidth="1280/1280",solidheight="720")]',
    ]);

    await preloadContextAssets(context);

    expect(loadMock).toHaveBeenCalledTimes(1);
    expect(loadMock.mock.calls[0]?.[0]).toEqual(
      expect.arrayContaining([
        "https://torappu.prts.wiki/assets/avg/background/47_g14_skyovercast_l1.png",
        "https://torappu.prts.wiki/assets/avg/background/47_g14_skyovercast_r1.png",
      ]),
    );
    expect(loadMock.mock.calls[0]?.[0]).not.toEqual(
      expect.arrayContaining([
        "https://torappu.prts.wiki/assets/avg/images/47_g14_skyovercast_l1.png",
        "https://torappu.prts.wiki/assets/avg/images/47_g14_skyovercast_r1.png",
      ]),
    );
  });

  it("preloads largeimg imagegroup tiles as image assets", async () => {
    const context = createContext([
      '[largeimg(imagegroup="61_i12/61_i11",solidwidth="1600/1600",solidheight="900")]',
    ]);

    await preloadContextAssets(context);

    expect(loadMock).toHaveBeenCalledTimes(1);
    expect(loadMock.mock.calls[0]?.[0]).toEqual(
      expect.arrayContaining([
        "https://torappu.prts.wiki/assets/avg/images/61_i12.png",
        "https://torappu.prts.wiki/assets/avg/images/61_i11.png",
      ]),
    );
    expect(loadMock.mock.calls[0]?.[0]).not.toEqual(
      expect.arrayContaining([
        "https://torappu.prts.wiki/assets/avg/background/61_i12.png",
        "https://torappu.prts.wiki/assets/avg/background/61_i11.png",
      ]),
    );
  });

  it("collects only playmusic key and intro plus playsound key", async () => {
    const context = createContext([
      '[playmusic(key="$m",intro="$intro")]',
      '[playsound(key="$s",intro="$ignored")]',
      '[musicvolume(key="$ignored")]',
      '[stopsound(key="$ignored")]',
    ]);
    context.audioVariables = {
      ignored: "sound_beta_2/avg/ignored",
      intro: "sound_beta_2/avg/intro",
      m: "sound_beta_2/avg/music",
      s: "sound_beta_2/avg/sound",
    };

    await preloadContextAssets(context);

    expect(loadMock.mock.calls[0]?.[0]).toEqual(
      expect.arrayContaining([
        "https://torappu.prts.wiki/assets/audio/avg/music.mp3",
        "https://torappu.prts.wiki/assets/audio/avg/intro.mp3",
        "https://torappu.prts.wiki/assets/audio/avg/sound.mp3",
      ]),
    );
    expect(loadMock.mock.calls[0]?.[0]).not.toContain(
      "https://torappu.prts.wiki/assets/audio/avg/ignored.mp3",
    );
  });
});
