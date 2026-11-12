import { describe, expect, it, vi } from "vitest";

import { StoryRuntime } from "../../src/widgets/StoryPlayer/engine/runtime";
import {
  createContext,
  FakeAudio,
  FakeRenderer,
} from "../helpers/runtimeFakes";

import type { RuntimeWarning } from "../../src/widgets/StoryPlayer/engine/types";

describe("StoryRuntime", () => {
  it("uses value predicates without treating them as label jumps", async () => {
    const renderer = new FakeRenderer();
    renderer.decisionValue = 2;
    renderer.decisionIndex = 1;
    const runtime = new StoryRuntime(
      createContext([
        '[decision(options="left;right",values="1;2")]',
        '[predicate(references="1")]',
        '[showitem(image="left")]',
        '[predicate(references="2")]',
        '[showitem(image="right")]',
        '[predicate(references="1;2")]',
        '[name="A"]merged',
      ]),
      renderer,
      new FakeAudio(),
    );

    await runtime.start();

    expect(renderer.showItemCalls.map((call) => call.key)).toEqual(["right"]);
    expect(renderer.lastDialogue).toEqual({ speaker: "A", text: "merged" });
  });

  it("exposes the displayed line index and decision selection for logAll highlighting", async () => {
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

    // 初始无显示
    expect(runtime.getDisplayedLineIndex()).toBeNull();
    expect(runtime.getDecisionSelectValue()).toBe(0);

    // 停在第一句对白
    await runtime.start();
    expect(runtime.getState()).toBe("waiting_input");
    expect(runtime.getDisplayedLineIndex()).toBe(1);

    // 推进过空对白 + decision（玩家选 2）+ predicate 过滤，停在 multiline
    await runtime.advance();
    expect(runtime.getState()).toBe("waiting_input");
    expect(runtime.getDecisionSelectValue()).toBe(2);
    expect(runtime.getDisplayedLineIndex()).toBe(7);
    expect(renderer.lastDialogue).toEqual({ speaker: "B", text: "合并" });

    // 选择历史以 decisionId（源行号）+ optionIndex 记录，供 Log All 路径求值
    expect(runtime.getLogPosition()).toEqual({
      lineIndex: 7,
      selections: [{ decisionId: 3, optionIndex: 1, value: 2 }],
    });
  });

  it("keeps the clicked option index when option values collide", async () => {
    const renderer = new FakeRenderer();
    // values="2;2"：显式值重复；values="2"：第 2 项落到缺省值 0。
    // 两种情况下 value 都无法唯一反查下标，但点击的是第 2 项。
    renderer.decisionValue = 2;
    renderer.decisionIndex = 1;
    const runtime = new StoryRuntime(
      createContext([
        '[decision(options="A1;B1", values="2;2")]', // line 1
        '[decision(options="A2;B2", values="2")]', // line 2
        '[name="A"]done', // line 3
      ]),
      renderer,
      new FakeAudio(),
    );

    await runtime.start();

    expect(runtime.getDecisionSelectValue()).toBe(2);
    expect(runtime.getLogPosition()).toEqual({
      lineIndex: 3,
      selections: [
        { decisionId: 1, optionIndex: 1, value: 2 },
        { decisionId: 2, optionIndex: 1, value: 2 },
      ],
    });
  });

  it("hands the panel per-option decision values with missing entries defaulting to 0", async () => {
    const renderer = new FakeRenderer();
    renderer.decisionIndex = 1;
    renderer.decisionValue = 0;
    const runtime = new StoryRuntime(
      createContext([
        '[decision(options="A;B;C", values="7")]', // line 1，只有 A 有显式值
        '[predicate(references="7")]', // line 2
        '[name="A"]只有选 A 才看得到', // line 3
      ]),
      renderer,
      new FakeAudio(),
    );

    await runtime.start();

    // 面板拿到的是 log/semantics.parseDecision 逐项解析好的 values；
    // 缺项取 0，与原生 DecisionPanel._GetOptionValue 越界分支一致
    expect(renderer.decisionCalls).toEqual([
      {
        disabled: [false, false, false],
        options: ["A", "B", "C"],
        values: [7, 0, 0],
      },
    ]);
  });

  it("parses decision and predicate values as signed Int32s", async () => {
    const renderer = new FakeRenderer();
    renderer.decisionIndex = 0;
    renderer.decisionValue = 1;
    const runtime = new StoryRuntime(
      createContext([
        '[decision(options="A;B;C;D", values=" +1 ;1.1;2147483648;-2147483648")]',
        '[predicate(references="1.1;1junk;2147483648")]',
        '[showitem(image="invalid-reference")]',
        '[predicate(references=" +1 ")]',
        '[name="A"]matched',
      ]),
      renderer,
      new FakeAudio(),
    );

    await runtime.start();

    expect(renderer.decisionCalls[0]?.values).toEqual([
      1, 0, 0, -2_147_483_648,
    ]);
    expect(renderer.showItemCalls).toEqual([]);
    expect(renderer.lastDialogue).toEqual({ speaker: "A", text: "matched" });
  });

  it("marks ampersand-prefixed options as disabled and strips the prefix", async () => {
    const renderer = new FakeRenderer();
    const runtime = new StoryRuntime(
      createContext([
        '[decision(options="&不可选;可选", values="1;2")]', // line 1
      ]),
      renderer,
      new FakeAudio(),
    );

    await runtime.start();

    // `&` 前缀在 log/semantics.parseDecision 剥离（原生 _SetupOptionText），
    // 面板拿到的是玩家可见文本 + 禁用标记
    expect(renderer.decisionCalls[0]).toEqual({
      disabled: [true, false],
      options: ["不可选", "可选"],
      values: [1, 2],
    });
  });

  it("warns when a decision exceeds the observed option count", async () => {
    const warnings: RuntimeWarning[] = [];
    const onWarning = (warning: RuntimeWarning) => warnings.push(warning);
    const runtime = new StoryRuntime(
      createContext(['[decision(options="1;2;3;4;5", values="1;2;3;4;5")]']),
      new FakeRenderer(),
      new FakeAudio(),
      { onWarning },
    );

    await runtime.start();

    // 原生上限为 DecisionPanel 预制体按钮数，超出打
    // "[AVG] Too many decision options. Some will be ignored!"
    expect(warnings).toEqual([
      expect.objectContaining({
        command: "decision",
        type: "invalid_parameter",
      }),
    ]);

    const boundaryWarnings: RuntimeWarning[] = [];
    const boundaryRuntime = new StoryRuntime(
      createContext(['[decision(options="1;2;3;4", values="1;2;3;4")]']),
      new FakeRenderer(),
      new FakeAudio(),
      { onWarning: (warning) => boundaryWarnings.push(warning) },
    );
    await boundaryRuntime.start();
    expect(boundaryWarnings).toEqual([]);
  });

  it("does not record a choice when the panel is cleared without a click", async () => {
    const renderer = new FakeRenderer();
    // optionIndex=-1：面板被销毁/顶替，玩家没点过；此时闸门值仍是 0
    renderer.decisionIndex = -1;
    renderer.decisionValue = 0;
    const runtime = new StoryRuntime(
      createContext([
        '[decision(options="A;B", values="1;2")]', // line 1
        '[name="A"]继续', // line 2
      ]),
      renderer,
      new FakeAudio(),
    );

    await runtime.start();

    expect(runtime.getLogPosition()).toEqual({ lineIndex: 2, selections: [] });
  });

  it("clears the gate and warns when a decision is missing options", async () => {
    const renderer = new FakeRenderer();
    renderer.decisionIndex = 1;
    renderer.decisionValue = 2;
    const warnings: RuntimeWarning[] = [];
    const runtime = new StoryRuntime(
      createContext([
        '[decision(options="A;B",values="1;2")]',
        '[predicate(references="2")]',
        '[decision(values="9")]',
        '[predicate(references="1")]',
        '[name="A"]after',
      ]),
      renderer,
      new FakeAudio(),
      { onWarning: (warning) => warnings.push(warning) },
    );
    runtime.setAutoPlayMode("button_auto");

    await runtime.start();

    expect(renderer.decisionCalls).toHaveLength(1);
    expect(renderer.lastDialogue).toEqual({ speaker: "A", text: "after" });
    expect(runtime.getAutoPlayState().mode).toBe("default");
    expect(runtime.getDecisionSelectValue()).toBe(0);
    expect(runtime.getLogPosition().selections).toEqual([
      { decisionId: 1, optionIndex: 1, value: 2 },
    ]);
    expect(warnings).toEqual([
      expect.objectContaining({
        command: "decision",
        detail: "decision options parameter is missing",
        lineNumber: 3,
        type: "invalid_parameter",
      }),
    ]);
  });

  it("settles a pending decision once when destroying the runtime", async () => {
    const renderer = new FakeRenderer();
    renderer.holdDecisions = true;
    const settleDecision = vi.spyOn(renderer, "settleDecision");
    const runtime = new StoryRuntime(
      createContext([
        '[decision(options="A;B",values="1;2")]',
        '[name="A"]after',
      ]),
      renderer,
      new FakeAudio(),
    );

    const started = runtime.start();
    expect(runtime.getState()).toBe("waiting_decision");
    runtime.destroy();
    runtime.destroy();

    expect(settleDecision).toHaveBeenCalledTimes(1);
    await started;
    expect(renderer.dialogueTexts).toEqual([]);
  });

  it.each([
    { choiceWaitMs: 100, expectedChars: 240 },
    { choiceWaitMs: 2000, expectedChars: 168 },
  ])(
    "keeps the sticker's auto-click clock during a decision held for $choiceWaitMs ms",
    async ({ choiceWaitMs, expectedChars }) => {
      vi.useFakeTimers();
      const renderer = new FakeRenderer();
      renderer.holdDecisions = true;
      const sleep = vi.fn(
        (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
      );
      const subtitle = "X".repeat(240);
      const runtime = new StoryRuntime(
        createContext([
          '[sticker(id="a",text="typing",delay=0.2,block=false)]',
          '[decision(options="A;B",values="1;2")]',
          `[subtitle(text="${subtitle}")]`,
        ]),
        renderer,
        new FakeAudio(),
        { sleep, typingIntervalMs: 40 },
      );
      try {
        runtime.setAutoPlayMode("button_auto");
        runtime.setAutoPlaySpeedLevel(1);
        const started = runtime.start();
        await vi.advanceTimersByTimeAsync(0);
        expect(runtime.getState()).toBe("waiting_decision");
        expect(runtime.getAutoPlayState().mode).toBe("button_auto");
        expect(renderer.stickerDelayChanges).toEqual([]);
        expect(renderer.typingActive).toBe(false);
        expect(sleep).toHaveBeenCalledExactlyOnceWith(590);
        await vi.advanceTimersByTimeAsync(choiceWaitMs);
        expect(runtime.getState()).toBe("waiting_decision");
        renderer.pickDecision({ optionIndex: 0, value: 1 });
        await started;

        // The 590ms click can reach the subtitle if it is already waiting.
        // A click that expired during the choice has no listener.
        await vi.advanceTimersByTimeAsync(1680);
        expect(renderer.subtitleText).toHaveLength(expectedChars);
        expect(renderer.stickerDelayChanges).toEqual([]);
      } finally {
        runtime.destroy();
        vi.useRealTimers();
      }
    },
  );

  it("ignores a queued decision selection after destroy", async () => {
    const renderer = new FakeRenderer();
    renderer.holdDecisions = true;
    const runtime = new StoryRuntime(
      createContext([
        '[decision(options="A;B",values="1;2")]',
        '[name="A"]after',
      ]),
      renderer,
      new FakeAudio(),
    );

    const started = runtime.start();
    renderer.pickDecision({ optionIndex: 1, value: 2 });
    runtime.destroy();
    await started;

    expect(runtime.getDecisionSelectValue()).toBe(0);
    expect(runtime.getLogPosition().selections).toEqual([]);
    expect(renderer.dialogueTexts).toEqual([]);
  });
});
