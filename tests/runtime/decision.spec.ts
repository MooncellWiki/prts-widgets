import { describe, expect, it } from "vitest";

import { StoryRuntime } from "../../src/widgets/StoryPlayer/engine/runtime";
import {
  createContext,
  FakeAudio,
  FakeRenderer,
} from "../helpers/runtimeFakes";

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
        options: ["A", "B", "C"],
        values: [7, 0, 0],
      },
    ]);
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
});
