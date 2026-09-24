import { describe, expect, it, vi } from "vitest";

import { StoryRuntime } from "../../src/widgets/StoryPlayer/engine/runtime";
import {
  createContext,
  FakeAudio,
  FakeRenderer,
} from "../helpers/runtimeFakes";

import type { RuntimeWarning } from "../../src/widgets/StoryPlayer/engine/types";

describe("StoryRuntime", () => {
  it("enters waiting_input on first dialogue", async () => {
    const renderer = new FakeRenderer();
    const runtime = new StoryRuntime(
      createContext(["[dialog]", '[name="A"]hello']),
      renderer,
      new FakeAudio(),
    );

    await runtime.start();

    expect(runtime.getState()).toBe("waiting_input");
    expect(renderer.lastDialogue).toEqual({ speaker: "A", text: "hello" });
  });

  it("runs delay with provided sleep handler", async () => {
    const sleep = vi.fn(async () => {});
    const runtime = new StoryRuntime(
      createContext(["[Delay(time=1)]", '[name="A"]done']),
      new FakeRenderer(),
      new FakeAudio(),
      { sleep },
    );

    await runtime.start();

    expect(sleep).toHaveBeenCalledExactlyOnceWith(1000);
    expect(runtime.getState()).toBe("waiting_input");
  });

  it("scales delay once by animateRatio and yields a frame for zero", async () => {
    const sleep = vi.fn(async () => {});
    const runtime = new StoryRuntime(
      createContext(["[delay(time=2)]", "[delay(time=0)]", '[name="A"]done']),
      new FakeRenderer(),
      new FakeAudio(),
      { animateRatio: 0.25, sleep },
    );

    await runtime.start();

    expect(sleep.mock.calls).toEqual([[500], [0]]);
  });

  it("uses native defaults for bare theater and restores manual input on exit", async () => {
    vi.useFakeTimers();
    try {
      const renderer = new FakeRenderer();
      const runtime = new StoryRuntime(
        createContext([
          "[theater]",
          '[name="A"]auto',
          "[theater(mode=false)]",
          '[name="B"]manual',
        ]),
        renderer,
        new FakeAudio(),
      );

      const start = runtime.start();
      await vi.advanceTimersByTimeAsync(1819);
      expect(renderer.lastDialogue).toEqual({ speaker: "A", text: "auto" });
      await vi.advanceTimersByTimeAsync(1);
      await start;

      expect(runtime.getState()).toBe("waiting_input");
      expect(renderer.lastDialogue).toEqual({ speaker: "B", text: "manual" });

      // Theater mode swallows clicks; once it exits a click advances again.
      await runtime.advance();
      expect(runtime.getState()).toBe("finished");
    } finally {
      vi.useRealTimers();
    }
  });

  it("auto-advances after the native button-auto delay and stops at endtip", async () => {
    vi.useFakeTimers();
    try {
      const renderer = new FakeRenderer();
      const runtime = new StoryRuntime(
        createContext(['[name="A"]hi', '[name="B"]next']),
        renderer,
        new FakeAudio(),
      );

      await runtime.start();
      runtime.setAutoPlayMode("button_auto");
      expect(runtime.getAutoPlayState().mode).toBe("button_auto");

      await vi.advanceTimersByTimeAsync(1559);
      expect(renderer.lastDialogue).toEqual({ speaker: "A", text: "hi" });
      await vi.advanceTimersByTimeAsync(1);
      await vi.advanceTimersByTimeAsync(200);
      expect(renderer.lastDialogue).toEqual({ speaker: "B", text: "next" });

      await vi.advanceTimersByTimeAsync(1620);
      expect(runtime.getAutoPlayState().mode).toBe("default");
      expect(runtime.getState()).toBe("waiting_input");
    } finally {
      vi.useRealTimers();
    }
  });

  it("uses the selected auto speed and manual input disables auto mode", async () => {
    vi.useFakeTimers();
    try {
      const renderer = new FakeRenderer();
      const runtime = new StoryRuntime(
        createContext(['[name="A"]abcd', '[name="B"]next']),
        renderer,
        new FakeAudio(),
      );

      await runtime.start();
      runtime.setAutoPlayMode("button_auto");
      runtime.setAutoPlaySpeedLevel(1);
      expect(runtime.getAutoPlayState().buttonSpeedLevel).toBe(1);

      await vi.advanceTimersByTimeAsync(559);
      expect(renderer.lastDialogue).toEqual({ speaker: "A", text: "abcd" });
      await vi.advanceTimersByTimeAsync(1);
      await vi.advanceTimersByTimeAsync(50);
      expect(renderer.lastDialogue).toEqual({ speaker: "B", text: "next" });

      await runtime.advance();
      expect(runtime.getAutoPlayState().mode).toBe("default");
    } finally {
      vi.useRealTimers();
    }
  });

  it("quick mode emits an immediate click and uses its own speed level", async () => {
    vi.useFakeTimers();
    try {
      const renderer = new FakeRenderer();
      const runtime = new StoryRuntime(
        createContext(['[name="A"]first', '[name="B"]second']),
        renderer,
        new FakeAudio(),
      );

      await runtime.start();
      runtime.setAutoPlayMode("quick_play");
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(70);
      expect(renderer.lastDialogue).toEqual({ speaker: "B", text: "second" });

      runtime.setAutoPlaySpeedLevel(3);
      expect(runtime.getAutoPlayState()).toMatchObject({
        mode: "quick_play",
        quickSpeedLevel: 3,
      });
      await vi.advanceTimersByTimeAsync(25);
      expect(runtime.getAutoPlayState().mode).toBe("default");
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not run normal commands for video-only story metadata", async () => {
    const renderer = new FakeRenderer();
    const context = createContext(['[video(res="video/entry.mp4")]']);
    context.storyMetadata = {
      args: { is_video_only: true },
      characterSortType: "BY_GAIN_TIME_DOWN",
      denyAutoSwitchScene: false,
      dontClearGameObjectPoolOnStart: false,
      fitMode: "DEFAULT",
      id: "",
      isAutoable: false,
      isSkippable: true,
      isTutorial: false,
      isVideoOnly: true,
      title: "",
    };
    const runtime = new StoryRuntime(context, renderer, new FakeAudio());

    await runtime.start();

    expect(runtime.getState()).toBe("finished");
    expect(renderer.videoCalls).toEqual([]);
  });

  it("treats a bracketed key=value tag as an empty dialog line", async () => {
    const renderer = new FakeRenderer();
    const warnings: RuntimeWarning[] = [];
    const runtime = new StoryRuntime(
      createContext(["[Delay=2]", '[name="A"]ok']),
      renderer,
      new FakeAudio(),
      { onWarning: (warning) => warnings.push(warning) },
    );

    await runtime.start();

    // `[Delay=2]` matches the parser's group-4 fallback, so it becomes a dialog
    // command with param {Delay: 2} and no content -- which hides the box and
    // returns false. It is not the delay command and it does not pause.
    expect(warnings).toEqual([]);
    expect(renderer.lastDialogue).toEqual({ speaker: "A", text: "ok" });
    expect(runtime.getState()).toBe("waiting_input");
  });

  it("skips endtip entirely in manual mode", async () => {
    const renderer = new FakeRenderer();
    const runtime = new StoryRuntime(
      createContext(['[name="A"]ok', "[endtip]tip"]),
      renderer,
      new FakeAudio(),
    );

    await runtime.start();
    await runtime.advance();

    // shouldProcessEndtip is false unless button-auto or quick-play is running,
    // and a click drops back to manual mode anyway, so the executor returns
    // without touching the dialog box and the story ends.
    expect(runtime.getState()).toBe("finished");
    expect(renderer.lastDialogue).toEqual({ speaker: "A", text: "ok" });
  });

  it("plays a video whose res carries no .mp4 extension", async () => {
    const renderer = new FakeRenderer();
    const warnings: RuntimeWarning[] = [];
    const runtime = new StoryRuntime(
      createContext(['[video(res="video/act15side/IW01")]', '[name="A"]after']),
      renderer,
      new FakeAudio(),
      { onWarning: (warning) => warnings.push(warning) },
    );

    const startPromise = runtime.start();
    await Promise.resolve();

    // IsMp4VideoPath has no call sites; the extension gates nothing.
    expect(renderer.videoCalls).toEqual([
      "https://torappu.prts.wiki/assets/video/act15side/iw01",
    ]);
    expect(warnings).toEqual([]);

    renderer.finishVideo();
    await startPromise;
  });

  it("warns and plays nothing when video has neither url nor res", async () => {
    const renderer = new FakeRenderer();
    const warnings: RuntimeWarning[] = [];
    const runtime = new StoryRuntime(
      createContext(["[video]", '[name="A"]after']),
      renderer,
      new FakeAudio(),
      { onWarning: (warning) => warnings.push(warning) },
    );

    await runtime.start();

    expect(renderer.videoCalls).toEqual([]);
    expect(warnings).toEqual([
      expect.objectContaining({
        detail: "video: no url or res",
        type: "invalid_parameter",
      }),
    ]);
  });

  it("warns and skips unsupported command", async () => {
    const warnings: RuntimeWarning[] = [];
    const runtime = new StoryRuntime(
      createContext(['[bgeffect(name="$eb_blackmask")]', '[name="A"]ok']),
      new FakeRenderer(),
      new FakeAudio(),
      {
        onWarning: (warning) => warnings.push(warning),
      },
    );

    await runtime.start();

    expect(runtime.getState()).toBe("waiting_input");
    expect(warnings).toEqual([
      expect.objectContaining({
        detail: "bgeffect",
        type: "unsupported_command",
      }),
    ]);
  });

  it("blocks on video command until playback completes", async () => {
    const renderer = new FakeRenderer();
    const runtime = new StoryRuntime(
      createContext([
        '[video(res="video/act15side/IW01.mp4")]',
        '[name="A"]after',
      ]),
      renderer,
      new FakeAudio(),
    );

    const startPromise = runtime.start();

    await Promise.resolve();

    expect(runtime.getState()).toBe("waiting_video");
    expect(renderer.videoCalls).toEqual([
      "https://torappu.prts.wiki/assets/video/act15side/iw01.mp4",
    ]);

    renderer.finishVideo();
    await startPromise;

    expect(runtime.getState()).toBe("waiting_input");
    expect(renderer.lastDialogue).toEqual({ speaker: "A", text: "after" });
  });

  it("supports multiline command as dialogue wait", async () => {
    const renderer = new FakeRenderer();
    const runtime = new StoryRuntime(
      createContext(['[multiline(name="A")]line1']),
      renderer,
      new FakeAudio(),
    );

    await runtime.start();

    expect(runtime.getState()).toBe("waiting_input");
    expect(renderer.lastDialogue).toEqual({ speaker: "A", text: "line1" });
  });

  it("pushes displayed line index changes to the registered listener", async () => {
    const renderer = new FakeRenderer();
    renderer.decisionValue = 2;
    renderer.decisionIndex = 1;
    const runtime = new StoryRuntime(
      createContext([
        '[name="A"]第一句', // line 1 → 显示中
        '[name=""]', // line 2 空对白，不更新显示行
        '[decision(options="A;B", values="1;2")]', // line 3
        '[predicate(references="1")]', // line 4
        '[name="A路"]', // line 5 (被 decisionSelectValue=2 过滤掉)
        '[predicate(references="2")]', // line 6
        '[multiline(name="B")]合并', // line 7 → 显示中
      ]),
      renderer,
      new FakeAudio(),
    );
    const pushed: Array<number | null> = [];
    // 订阅即补发当前值：此时还没 start，补发的是 null
    runtime.onDisplayedLineChange((lineIndex) => pushed.push(lineIndex));
    expect(pushed).toEqual([null]);

    await runtime.start();
    // 空对白/decision/predicate 过滤行都不触发推送，只有真正显示的文本行推
    expect(pushed).toEqual([null, 1]);

    await runtime.advance();
    expect(pushed).toEqual([null, 1, 7]);
    expect(runtime.getDisplayedLineIndex()).toBe(7);
  });

  it("supports multiple displayed line listeners with independent disposal", async () => {
    const runtime = new StoryRuntime(
      createContext(['[name="A"]第一句', '[name="B"]第二句']),
      new FakeRenderer(),
      new FakeAudio(),
    );
    const first: Array<number | null> = [];
    const second: Array<number | null> = [];
    // index.vue 的 Log All 高亮与调试页行跟随各自订阅，互不顶替
    const disposeFirst = runtime.onDisplayedLineChange((lineIndex) =>
      first.push(lineIndex),
    );
    runtime.onDisplayedLineChange((lineIndex) => second.push(lineIndex));

    await runtime.start();
    expect(first).toEqual([null, 1]);
    expect(second).toEqual([null, 1]);

    disposeFirst();
    await runtime.advance();
    expect(first).toEqual([null, 1]);
    expect(second).toEqual([null, 1, 2]);
  });

  it("isolates a throwing displayed line listener from playback", async () => {
    const warnings: RuntimeWarning[] = [];
    const runtime = new StoryRuntime(
      createContext(['[name="A"]第一句', '[name="B"]第二句']),
      new FakeRenderer(),
      new FakeAudio(),
      { onWarning: (warning) => warnings.push(warning) },
    );
    const healthy: Array<number | null> = [];
    // 推送是在 processLoop 的 try 里同步跑的：监听器直接抛会被那里的 catch
    // 收成 state="error"，一个 UI 侧的坏订阅者就能把整场播放打死
    runtime.onDisplayedLineChange(() => {
      throw new Error("UI blew up");
    });
    runtime.onDisplayedLineChange((lineIndex) => healthy.push(lineIndex));
    // 订阅即补发也走同一条守卫路径：补发时抛出同样只记 warning，不会甩给订阅方
    expect(warnings.map((warning) => warning.detail)).toEqual(["UI blew up"]);

    await runtime.start();
    expect(runtime.getState()).toBe("waiting_input");
    expect(healthy).toEqual([null, 1]);
    expect(warnings.map((warning) => warning.detail)).toEqual([
      "UI blew up",
      "UI blew up",
    ]);

    await runtime.advance();
    expect(runtime.getState()).toBe("waiting_input");
    expect(healthy).toEqual([null, 1, 2]);
  });

  it("click skips typewriter first, then advances", async () => {
    const sleep = vi.fn(() => new Promise<void>(() => {}));

    const renderer = new FakeRenderer();
    const runtime = new StoryRuntime(
      createContext(['[name="A"]hello']),
      renderer,
      new FakeAudio(),
      {
        sleep,
        typingIntervalMs: 30,
      },
    );

    await runtime.start();

    expect(runtime.getState()).toBe("waiting_input");
    expect(renderer.lastDialogue).toEqual({ speaker: "A", text: "" });
    expect(sleep).toHaveBeenCalledExactlyOnceWith(30);

    await runtime.advance();
    expect(runtime.getState()).toBe("waiting_input");
    expect(renderer.lastDialogue).toEqual({ speaker: "A", text: "hello" });

    // The auto-appended endtip is a no-op in manual mode (shouldProcessEndtip is
    // false unless button-auto or quick-play is running), so the story ends here.
    await runtime.advance();
    expect(runtime.getState()).toBe("finished");
  });

  it("hides an empty name line without blocking", async () => {
    const renderer = new FakeRenderer();
    const runtime = new StoryRuntime(
      createContext(['[name="A"]', '[name="B"]next']),
      renderer,
      new FakeAudio(),
    );

    await runtime.start();

    expect(renderer.lastDialogue).toEqual({ speaker: "B", text: "next" });
    expect(runtime.getState()).toBe("waiting_input");
  });

  it("appends multiline content until an end line is advanced", async () => {
    const renderer = new FakeRenderer();
    const runtime = new StoryRuntime(
      createContext([
        '[multiline(name="A")]one',
        '[multiline(name="A",end=true)]two',
        '[multiline(name="A")]three',
      ]),
      renderer,
      new FakeAudio(),
    );

    await runtime.start();
    expect(renderer.lastDialogue.text).toBe("one");
    await runtime.advance();
    expect(renderer.lastDialogue.text).toBe("onetwo");
    await runtime.advance();
    expect(renderer.lastDialogue.text).toBe("three");
  });

  it("resumes multiline typing from the characters already on screen", async () => {
    vi.useFakeTimers();
    try {
      const renderer = new FakeRenderer();
      const runtime = new StoryRuntime(
        createContext([
          '[multiline(name="A")]ab',
          '[multiline(name="A",end=true)]cd',
        ]),
        renderer,
        new FakeAudio(),
        { typingIntervalMs: 20 },
      );

      await runtime.start();
      await vi.advanceTimersByTimeAsync(200);
      expect(renderer.lastDialogue.text).toBe("ab");

      renderer.dialogueTexts.length = 0;
      await runtime.advance();
      await vi.advanceTimersByTimeAsync(200);

      // Native AppendText keeps the earlier fragment on screen, so the box is
      // never blanked and "ab" is never retyped character by character.
      expect(renderer.dialogueTexts).toEqual(["ab", "abc", "abcd"]);
      expect(renderer.lastDialogue.text).toBe("abcd");
    } finally {
      vi.useRealTimers();
    }
  });

  it.each([
    {
      // `GetOrDefault<float>("delay", typeWriterDelay)` makes the ratio
      // 20ms / 40ms = 0.5, so characters land every 10ms rather than every 20.
      name: "omitted (current typewriter delay)",
      line: '[multiline(name="A")]ab',
      charMs: 10,
    },
    {
      name: "0.08 (ratio of the 40ms origin)",
      line: '[multiline(name="A",delay=0.08)]ab',
      charMs: 40,
    },
  ])(
    "types multiline characters every $charMs ms when delay is $name",
    async ({ line, charMs }) => {
      vi.useFakeTimers();
      try {
        const renderer = new FakeRenderer();
        const runtime = new StoryRuntime(
          createContext([line]),
          renderer,
          new FakeAudio(),
          { typingIntervalMs: 20 },
        );

        await runtime.start();
        expect(renderer.lastDialogue.text).toBe("");
        await vi.advanceTimersByTimeAsync(charMs - 1);
        expect(renderer.lastDialogue.text).toBe("");
        await vi.advanceTimersByTimeAsync(1);
        expect(renderer.lastDialogue.text).toBe("a");
        await vi.advanceTimersByTimeAsync(charMs);
        expect(renderer.lastDialogue.text).toBe("ab");
      } finally {
        vi.useRealTimers();
      }
    },
  );
});
