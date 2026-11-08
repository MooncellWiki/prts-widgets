import { createApp, nextTick } from "vue";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createStoryPlayer } from "../src/widgets/StoryPlayer/engine/createStoryPlayer";
import StoryPlayerWidget from "../src/widgets/StoryPlayer/index.vue";

import {
  loads,
  preloaded,
  preloadSound,
  settlePlayback,
} from "./helpers/fakePixiSound";
import { createContext, FakeRenderer } from "./helpers/runtimeFakes";

// 剧情结束离开播放界面后的音频收尾：StoryPlayer.closeAfterStory 与跳过按钮。
// 图形栈换成 FakeRenderer，PIXI 音频换成手动结算的假实现，HtmlStoryAudio 是真的。
vi.mock("@pixi/sound", () => ({ sound: { disableAutoPause: false } }));
vi.mock("pixi.js", async () => ({
  Assets: (await import("./helpers/fakePixiSound")).fakeAssets,
}));
vi.mock("../src/widgets/StoryPlayer/engine/renderer", () => ({
  PixiStoryRenderer: class {
    constructor() {
      return new FakeRenderer();
    }
  },
}));
vi.mock("../src/widgets/StoryPlayer/context", () => ({
  loadContextByScript: async (script: string) =>
    createContext(script.split("\n")),
}));
vi.mock("../src/widgets/StoryPlayer/engine/preload", () => ({
  preloadContextAssets: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../src/widgets/StoryPlayer/engine/font", () => ({
  preloadDialogFont: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../src/widgets/StoryPlayer/components/AssetListModal.vue", () => ({
  default: { render: () => null },
}));
vi.mock("../src/widgets/StoryPlayer/components/LogAllPanel.vue", () => ({
  default: { render: () => null },
}));

beforeEach(() => {
  loads.length = 0;
  preloaded.clear();
  vi.useFakeTimers({
    toFake: ["performance", "requestAnimationFrame", "setTimeout"],
  });
});

afterEach(() => vi.useRealTimers());

const LOOP_THEN_SKIP = [
  '[playsound(key="loop",loop=true)]',
  '[name="A"]ok',
  '[skipnode(mode="skip")]',
];

/** 播到第一句，返回循环音效实例，再跳过到剧情结束。 */
async function playToSkippedEnd(player: ReturnType<typeof createStoryPlayer>) {
  const loopClip = preloadSound("loop");
  await player.mount(document.createElement("div"));
  void player.start();
  const { instance: loop } = await settlePlayback(loopClip);
  await vi.advanceTimersByTimeAsync(160);
  await player.skipNode();
  expect(player.getState()).toBe("finished");
  return { loop, loopClip };
}

describe("StoryPlayer.closeAfterStory", () => {
  it("hard-stops the closing sounds when destroyed mid-fade", async () => {
    const player = createStoryPlayer(createContext(LOOP_THEN_SKIP));
    const { loop } = await playToSkippedEnd(player);

    const closing = player.closeAfterStory();
    await vi.advanceTimersByTimeAsync(160);
    expect(loop.stopped).toBe(0);
    player.destroy();
    expect(loop.stopped).toBe(1);
    await vi.advanceTimersByTimeAsync(20);
    await closing;
    expect(loop.stopped).toBe(1);
  });

  it("keeps the next run's audio when mounted again mid-fade", async () => {
    const player = createStoryPlayer(createContext(LOOP_THEN_SKIP));
    const { loop, loopClip } = await playToSkippedEnd(player);

    const closing = player.closeAfterStory();
    // mount() 重建 runtime 时换一个新的 audio，旧的收尾音效直接硬停
    await player.mount(document.createElement("div"));
    expect(loop.stopped).toBe(1);
    await vi.advanceTimersByTimeAsync(600);
    await closing;

    void player.start();
    const { instance: next } = await settlePlayback(loopClip);
    expect(loopClip.playCalls).toBe(2);
    await vi.advanceTimersByTimeAsync(600);
    expect(next.stopped).toBe(0);
    // 旧收尾结束时没有把新 audio 当成自己的清掉，destroy() 仍然管得到它
    player.destroy();
    expect(next.stopped).toBe(1);
  });
});

describe("StoryPlayer skip button audio", () => {
  it("returns to the lobby while both sound fades run to their original deadlines", async () => {
    const musicClip = preloadSound("bgm");
    const loopClip = preloadSound("loop");
    const stoppingClip = preloadSound("steps");
    const script = [
      '[playmusic(key="bgm",crossfade=0)]',
      '[playsound(key="loop",loop=true)]',
      '[playsound(key="steps",loop=true)]',
      '[stopsound(channel="steps",fadetime=1.28)]',
      '[name="A"]ok',
      '[skipnode(mode="skip")]',
    ].join("\n");
    const host = document.createElement("div");
    document.body.append(host);
    const app = createApp(StoryPlayerWidget, { script, autoStart: true });
    app.mount(host);

    try {
      await vi.advanceTimersByTimeAsync(0);
      const { instance: music } = await settlePlayback(musicClip);
      const { instance: loop } = await settlePlayback(loopClip);
      const { instance: stopping } = await settlePlayback(stoppingClip);
      await vi.advanceTimersByTimeAsync(160);

      const skip = [...host.querySelectorAll("button")].find((button) =>
        button.textContent.includes("跳过剧情"),
      );
      expect(skip?.disabled).toBe(false);
      skip!.click();
      await vi.advanceTimersByTimeAsync(0);
      await nextTick();
      expect(host.textContent).toContain("完整加载");
      expect(music.stopped).toBe(1);
      expect(loop.stopped).toBe(0);
      expect(stopping.stopped).toBe(0);

      await vi.advanceTimersByTimeAsync(400);
      expect(loop.volume).toBeCloseTo(0.2);
      expect(stopping.volume).toBeCloseTo(0.5625);
      await vi.advanceTimersByTimeAsync(112);
      expect(loop.stopped).toBe(1);
      expect(stopping.stopped).toBe(0);
      await vi.advanceTimersByTimeAsync(608);
      expect(stopping.stopped).toBe(1);
    } finally {
      app.unmount();
      host.remove();
    }
  });
});
