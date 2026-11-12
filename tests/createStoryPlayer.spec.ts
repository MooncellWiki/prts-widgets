import { describe, expect, it, vi } from "vitest";

import { createStoryPlayer } from "../src/widgets/StoryPlayer/engine/createStoryPlayer";

import { FakeRenderer } from "./helpers/runtimeFakes";

import type { DecisionSelection } from "../src/widgets/StoryPlayer/engine/types";

// 使用实际的 StoryRuntime。图形和 @pixi/sound 用桩以便在 happy-dom 中运行。
vi.mock("@pixi/sound", () => ({ sound: { disableAutoPause: false } }));
vi.mock("../src/widgets/StoryPlayer/engine/renderer", async () => {
  const { FakeRenderer } = await import("./helpers/runtimeFakes");
  return { PixiStoryRenderer: FakeRenderer };
});

function createPlayer(script: readonly string[]) {
  return createStoryPlayer({
    audioVariables: {},
    linkMap: {},
    script: [...script],
  });
}

describe("createStoryPlayer", () => {
  it("keeps auto play when the stage shortcut is pressed during a decision", async () => {
    const player = createPlayer([
      '[decision(options="A;B",values="1;2")]',
      '[name="A"]after',
    ]);
    const choice = Promise.withResolvers<DecisionSelection>();
    const showDecision = vi
      .spyOn(FakeRenderer.prototype, "showDecision")
      .mockReturnValueOnce(choice.promise);
    try {
      await player.mount(document.createElement("div"));
      player.setAutoPlayMode("button_auto");
      const started = player.start();
      expect(player.getState()).toBe("waiting_decision");

      // The stage's Enter and Space handlers use the public advance entry.
      await player.advance();
      expect(player.getState()).toBe("waiting_decision");
      expect(player.getAutoPlayState().mode).toBe("button_auto");

      choice.resolve({ optionIndex: 0, value: 1 });
      await started;
      expect(player.getDisplayedLineIndex()).toBe(2);
      expect(player.getAutoPlayState().mode).toBe("button_auto");
    } finally {
      player.destroy();
      choice.resolve({ optionIndex: -1, value: 0 });
      showDecision.mockRestore();
    }
  });

  it("replays the current line to a listener that subscribes mid-play", async () => {
    const player = createPlayer(['[name="A"]第一句', '[name="B"]第二句']);
    const seen: Array<number | null> = [];

    await player.mount(document.createElement("div"));
    await player.start();
    // 订阅即补发：调用方不必自己 getDisplayedLineIndex() 播种
    player.onDisplayedLineChange((lineIndex) => seen.push(lineIndex));

    expect(seen).toEqual([1]);
  });

  it("stops pushing after the disposer runs, even across a runtime rebuild", async () => {
    const player = createPlayer(['[name="A"]第一句', '[name="B"]第二句']);
    const host = document.createElement("div");
    const seen: Array<number | null> = [];

    await player.mount(host);
    const dispose = player.onDisplayedLineChange((lineIndex) =>
      seen.push(lineIndex),
    );
    // destroy() 丢弃 runtime，mount() 建新 runtime 时重新挂上转发者；
    // 注销只是把监听器从闭包 Set 里摘掉，与 runtime 换代无关
    player.destroy();
    await player.mount(host);
    dispose();
    seen.length = 0;

    await player.start();
    expect(player.getDisplayedLineIndex()).toBe(1);
    expect(seen).toEqual([]);
  });

  it("stops pushing when the listener was registered before the first mount", async () => {
    const player = createPlayer(['[name="A"]第一句']);
    const seen: Array<number | null> = [];
    // mount 前订阅时还没有 runtime，注销函数不能因此变成空操作
    const dispose = player.onDisplayedLineChange((lineIndex) =>
      seen.push(lineIndex),
    );
    expect(seen).toEqual([null]);

    await player.mount(document.createElement("div"));
    dispose();
    seen.length = 0;

    await player.start();
    expect(player.getDisplayedLineIndex()).toBe(1);
    expect(seen).toEqual([]);
  });

  it("keeps undisposed listeners attached across a runtime rebuild", async () => {
    const player = createPlayer(['[name="A"]第一句']);
    const host = document.createElement("div");
    const seen: Array<number | null> = [];

    await player.mount(host);
    player.onDisplayedLineChange((lineIndex) => seen.push(lineIndex));
    player.destroy();
    await player.mount(host);
    // 订阅时补发一次 null，重建后新 runtime 又补发一次 —— 重开一局高亮就此重置
    expect(seen).toEqual([null, null]);
    seen.length = 0;

    await player.start();
    expect(seen).toEqual([1]);
    expect(player.getDisplayedLineIndex()).toBe(1);
  });
});
