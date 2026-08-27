import { describe, expect, it, vi } from "vitest";

import { createStoryPlayer } from "../src/widgets/StoryPlayer/engine/createStoryPlayer";

import type { Context } from "../src/widgets/StoryPlayer/context";

// createStoryPlayer 只在这三处碰真实的图形/音频栈，happy-dom 下跑不起来。
// 换成吞掉一切调用的桩后，剩下的 StoryRuntime 是真的，监听器接线才测得准。
// vi.mock 的工厂在模块体求值前就会被调用，所以桩必须写成会提升的函数声明。
function noop(): void {}

function noopMethod(): () => void {
  return noop;
}

function stubInstance(): object {
  return new Proxy({}, { get: noopMethod });
}

vi.mock("@pixi/sound", () => ({ sound: { disableAutoPause: false } }));
vi.mock("../src/widgets/StoryPlayer/engine/renderer", () => ({
  PixiStoryRenderer: class {
    constructor() {
      return stubInstance();
    }
  },
}));
vi.mock("../src/widgets/StoryPlayer/engine/audio", () => ({
  HtmlStoryAudio: class {
    constructor() {
      return stubInstance();
    }
  },
}));

function createPlayer(script: readonly string[]) {
  return createStoryPlayer({
    audioVariables: {},
    linkMap: {},
    script: [...script],
  } as unknown as Context);
}

describe("createStoryPlayer", () => {
  it("stops pushing after the disposer runs, even across a runtime rebuild", async () => {
    const player = createPlayer(['[name="A"]第一句', '[name="B"]第二句']);
    const host = document.createElement("div");
    const seen: Array<number | null> = [];

    await player.mount(host);
    const dispose = player.onDisplayedLineChange((lineIndex) =>
      seen.push(lineIndex),
    );
    // destroy() 丢弃 runtime，mount() 从闭包 Set 里把监听器重新挂到新 runtime 上；
    // 注销必须摘掉这次新挂的，而不是订阅时捕获的那个已作废的注销函数
    player.destroy();
    await player.mount(host);
    dispose();

    await player.start();
    expect(seen).toEqual([]);
  });

  it("stops pushing when the listener was registered before the first mount", async () => {
    const player = createPlayer(['[name="A"]第一句']);
    const seen: Array<number | null> = [];
    // mount 前订阅时还没有 runtime，注销函数不能因此变成空操作
    const dispose = player.onDisplayedLineChange((lineIndex) =>
      seen.push(lineIndex),
    );

    await player.mount(document.createElement("div"));
    dispose();

    await player.start();
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

    await player.start();
    expect(seen).toEqual([1]);
    expect(player.getDisplayedLineIndex()).toBe(1);
  });
});
