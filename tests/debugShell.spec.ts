import { createApp, defineComponent, h } from "vue";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import StoryPlayerDebugShell from "../src/widgets/StoryPlayer/components/StoryPlayerDebugShell.vue";

// index.vue 整链会拉 context/字体并挂 PIXI（happy-dom 跑不动），stub 成
// 只暴露 getPlayer 的空组件；订阅回调由测试手动 emit，驱动行高亮断言
const stub = vi.hoisted(() => {
  const listeners = new Set<(lineIndex: number | null) => void>();
  return {
    listeners,
    player: {
      onDisplayedLineChange(
        listener: (lineIndex: number | null) => void,
      ): () => void {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
      emit(lineIndex: number | null): void {
        for (const listener of listeners) listener(lineIndex);
      },
    },
    ready: false,
  };
});

vi.mock("../src/widgets/StoryPlayer/index.vue", () => ({
  default: defineComponent({
    name: "StoryPlayerStub",
    setup(_, { expose }) {
      expose({
        getContext: () => null,
        getPlayer: () => (stub.ready ? stub.player : null),
      });
      // 静态桩渲染不引用 setup 作用域，正是 unicorn 想提走的形态
      // eslint-disable-next-line unicorn/consistent-function-scoping
      return () => h("div", { class: "story-player-stub" });
    },
  }),
}));

const SCRIPT = '[name="A"]第一句\n[name="B"]第二句\n[stop]';

describe("StoryPlayerDebugShell UI smoke", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, text: async () => SCRIPT })),
    );
    window.location.search = "?path=obt/main/level_main_00-01_beg.txt";
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    stub.ready = false;
    stub.listeners.clear();
  });

  it("renders script lines and drives current-line highlight via subscription", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const app = createApp(StoryPlayerDebugShell);
    app.mount(host);

    // onMounted 触发 loadScript（stub 的 fetch 异步返回）→ epoch 变化
    await vi.advanceTimersByTimeAsync(0);
    // 播放器"创建完成"后，引导轮询（150ms 一档）应挂上订阅
    stub.ready = true;
    await vi.advanceTimersByTimeAsync(500);

    expect(host.querySelector(".story-player-stub")).not.toBeNull();
    expect(host.querySelectorAll(".spd-line")).toHaveLength(3);
    expect(stub.listeners.size).toBe(1);

    // 推送第 2 行 → 高亮切到 data-line=2
    stub.player.emit(2);
    await vi.advanceTimersByTimeAsync(0);
    expect(
      host.querySelector<HTMLElement>(".spd-line-current")?.dataset.line,
    ).toBe("2");

    // 再推第 1 行 → 旧高亮消失，新高亮就位
    stub.player.emit(1);
    await vi.advanceTimersByTimeAsync(0);
    expect(
      host.querySelector<HTMLElement>(".spd-line-current")?.dataset.line,
    ).toBe("1");

    app.unmount();
    // 卸载时注销订阅
    expect(stub.listeners.size).toBe(0);
  });
});
