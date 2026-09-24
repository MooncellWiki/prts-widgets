// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

import { DIALOG_FRAME_URL } from "../src/widgets/StoryPlayer/assets";
import {
  collectContextAssetManifest,
  collectContextAssetUrls,
  preloadContextAssets,
} from "../src/widgets/StoryPlayer/engine/preload";

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
  // SlideMaskFilter(经 PixiStoryRenderer 引入)在 import/首次构造时会用到
  // 这些导出;本套件不渲染,桩即可。
  Filter: class {},
  GlProgram: { from: () => ({}) },
  GpuProgram: { from: () => ({}) },
  UniformGroup: class {},
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

  it("exposes the deduplicated asset URLs without loading them", () => {
    const context = createContext([
      '[background(image="bg_rhodes_day")]',
      '[background(image="bg_rhodes_day")]',
      '[image(image="avg_01")]',
    ]);

    // 只列剧情资源:对话框黑条纹理(DIALOG_FRAME_URL)是播放器内置资源,不在其中。
    expect(collectContextAssetUrls(context)).toEqual([
      "https://torappu.prts.wiki/assets/avg/background/bg_rhodes_day.png",
      "https://torappu.prts.wiki/assets/avg/images/avg_01.png",
    ]);
    expect(loadMock).not.toHaveBeenCalled();
  });

  it("lists every face for a used base and marks referenced faces", () => {
    const context = createContext([
      '[character(name="face_character#1")]',
      '[charslot(slot="m",name="face_character#2")]',
    ]);
    context.linkMap.face_character = {
      array: [
        { alias: "default", face: "face/1", group: 0, name: "1$1" },
        { alias: "smile", face: "face/2", group: 0, name: "2$1" },
        { alias: "angry", face: "face/3", group: 0, name: "3$1" },
      ],
      groups: [
        {
          base: "face/base",
          faceRect: { h: 80, w: 100, x: 120, y: 40 },
          mode: "face_overlay",
        },
      ],
      pos: { x: 0, y: 0 },
      size: { x: 0, y: 0 },
    };

    const manifest = collectContextAssetManifest(context);

    expect(manifest.faceAssets).toEqual([
      {
        baseUrl:
          "https://torappu.prts.wiki/assets/avg/characters/face/base.png",
        expression: "1$1",
        faceRect: { h: 80, w: 100, x: 120, y: 40 },
        faceUrl: "https://torappu.prts.wiki/assets/avg/characters/face/1.png",
        used: true,
      },
      {
        baseUrl:
          "https://torappu.prts.wiki/assets/avg/characters/face/base.png",
        expression: "2$1",
        faceRect: { h: 80, w: 100, x: 120, y: 40 },
        faceUrl: "https://torappu.prts.wiki/assets/avg/characters/face/2.png",
        used: true,
      },
      {
        baseUrl:
          "https://torappu.prts.wiki/assets/avg/characters/face/base.png",
        expression: "3$1",
        faceRect: { h: 80, w: 100, x: 120, y: 40 },
        faceUrl: "https://torappu.prts.wiki/assets/avg/characters/face/3.png",
        used: false,
      },
    ]);
    expect(manifest.urls).toEqual([
      "https://torappu.prts.wiki/assets/avg/characters/face/1.png",
      "https://torappu.prts.wiki/assets/avg/characters/face/base.png",
      "https://torappu.prts.wiki/assets/avg/characters/face/2.png",
    ]);
    expect(loadMock).not.toHaveBeenCalled();
  });

  it("resolves character refs with whitespace inside the suffix like native", () => {
    const context = createContext([
      '[charslot(slot="m",name="avg_4236_tmslot_1#3 $1")]',
    ]);
    context.linkMap.avg_4236_tmslot_1 = {
      array: [
        { alias: "", face: "tmslot/1", group: 0, name: "1$1" },
        { alias: "", face: "tmslot/2", group: 0, name: "2$1" },
        { alias: "", face: "tmslot/3", group: 0, name: "3$1" },
      ],
      groups: [
        {
          base: "tmslot/base",
          faceRect: { h: 80, w: 100, x: 120, y: 40 },
          mode: "face_overlay",
        },
      ],
      pos: { x: 0, y: 0 },
      size: { x: 0, y: 0 },
    };

    const manifest = collectContextAssetManifest(context);

    expect(
      manifest.faceAssets.map((asset) => ({
        expression: asset.expression,
        used: asset.used,
      })),
    ).toEqual([
      { expression: "1$1", used: false },
      { expression: "2$1", used: false },
      { expression: "3$1", used: true },
    ]);
  });

  it("preloads character command portraits using case-insensitive refs", async () => {
    const progress = vi.fn();
    const context = createContext([
      '[character(name="avg_1012_skadiSP_1#2",name2="char_empty")]',
      '[charslot(slot="m",name="avg_npc_180#3")]',
    ]);

    await preloadContextAssets(context, progress);

    expect(loadMock).toHaveBeenCalledTimes(1);
    expect(loadMock.mock.calls[0]?.[0]).toEqual([
      "https://torappu.prts.wiki/assets/avg/characters/avg_1012_skadisp_1/avg_1012_skadisp_2.png",
      "https://torappu.prts.wiki/assets/avg/characters/char_empty/char_empty.png",
      "https://torappu.prts.wiki/assets/avg/characters/avg_npc_180/avg_npc_180_3.png",
      DIALOG_FRAME_URL,
    ]);
    expect(progress).toHaveBeenCalledWith(1);
  });

  it("preloads background command images as background assets", async () => {
    const context = createContext(['[background(image="bg_rhodes_day")]']);

    await preloadContextAssets(context);

    expect(loadMock.mock.calls[0]?.[0]).toEqual([
      "https://torappu.prts.wiki/assets/avg/background/bg_rhodes_day.png",
      DIALOG_FRAME_URL,
    ]);
  });

  it("preloads avgdisplay bg content as a background asset", async () => {
    const context = createContext([
      '[avgdisplay(id="1",style="bg",name="bg_black",slot="bgover")]',
      '[avgdisplay(id="1")]',
    ]);

    await preloadContextAssets(context);

    expect(loadMock.mock.calls[0]?.[0]).toEqual([
      "https://torappu.prts.wiki/assets/avg/background/bg_black.png",
      DIALOG_FRAME_URL,
    ]);
  });

  it("preloads gridbg tiles as background assets", async () => {
    const context = createContext([
      '[gridbg(imagegroup="47_g14_skyovercast_L1/47_g14_skyovercast_R1/47_g14_skyovercast_L2/47_g14_skyovercast_R2",solidwidth="1280/1280/1280/1280",solidheight="720/720/720/720")]',
    ]);

    await preloadContextAssets(context);

    expect(loadMock).toHaveBeenCalledTimes(1);
    expect(loadMock.mock.calls[0]?.[0]).toEqual([
      "https://torappu.prts.wiki/assets/avg/background/47_g14_skyovercast_l1.png",
      "https://torappu.prts.wiki/assets/avg/background/47_g14_skyovercast_r1.png",
      "https://torappu.prts.wiki/assets/avg/background/47_g14_skyovercast_l2.png",
      "https://torappu.prts.wiki/assets/avg/background/47_g14_skyovercast_r2.png",
      DIALOG_FRAME_URL,
    ]);
  });

  it("preloads verticalbg cggroup tiles as image assets", async () => {
    const context = createContext([
      '[verticalbg(cggroup="69_i12_1/69_i12_2",solidwidth="1600",solidheight="900/900")]',
    ]);

    await preloadContextAssets(context);

    expect(loadMock).toHaveBeenCalledTimes(1);
    expect(loadMock.mock.calls[0]?.[0]).toEqual([
      "https://torappu.prts.wiki/assets/avg/images/69_i12_1.png",
      "https://torappu.prts.wiki/assets/avg/images/69_i12_2.png",
      DIALOG_FRAME_URL,
    ]);
  });

  it("prefers imagegroup background tiles when verticalbg also includes cggroup", async () => {
    const context = createContext([
      '[verticalbg(imagegroup="47_g14_skyovercast_L1/47_g14_skyovercast_R1",cggroup="69_i12_1/69_i12_2",solidwidth="1280/1280",solidheight="720")]',
    ]);

    await preloadContextAssets(context);

    expect(loadMock).toHaveBeenCalledTimes(1);
    expect(loadMock.mock.calls[0]?.[0]).toEqual([
      "https://torappu.prts.wiki/assets/avg/background/47_g14_skyovercast_l1.png",
      "https://torappu.prts.wiki/assets/avg/background/47_g14_skyovercast_r1.png",
      DIALOG_FRAME_URL,
    ]);
  });

  it("preloads largeimg imagegroup tiles as image assets", async () => {
    const context = createContext([
      '[largeimg(imagegroup="61_i12/61_i11",solidwidth="1600/1600",solidheight="900")]',
    ]);

    await preloadContextAssets(context);

    expect(loadMock).toHaveBeenCalledTimes(1);
    expect(loadMock.mock.calls[0]?.[0]).toEqual([
      "https://torappu.prts.wiki/assets/avg/images/61_i12.png",
      "https://torappu.prts.wiki/assets/avg/images/61_i11.png",
      DIALOG_FRAME_URL,
    ]);
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

    expect(loadMock.mock.calls[0]?.[0]).toEqual([
      "https://torappu.prts.wiki/assets/audio/avg/music.mp3",
      "https://torappu.prts.wiki/assets/audio/avg/intro.mp3",
      "https://torappu.prts.wiki/assets/audio/avg/sound.mp3",
      DIALOG_FRAME_URL,
    ]);
  });
});
