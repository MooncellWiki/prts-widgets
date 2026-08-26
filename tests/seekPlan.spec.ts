import { describe, expect, it } from "vitest";

import { planChoicesForLine } from "../src/widgets/StoryPlayer/engine/log/seek";
import { analyzeStoryFlow } from "../src/widgets/StoryPlayer/engine/log/symbolicFlow";
import { parseScript } from "../src/widgets/StoryPlayer/engine/parser";
import { StoryRuntime } from "../src/widgets/StoryPlayer/engine/runtime";

import type { Context } from "../src/widgets/StoryPlayer/context";
import type {
  DecisionSelection,
  ShowItemInput,
  StoryAudio,
  StoryRenderer,
} from "../src/widgets/StoryPlayer/engine/types";

/**
 * 行号跳转规划：planChoicesForLine 从符号分析产物里取出「到达目标行的
 * 选择方案」。语义依据与 LogAllList 的 exact 高亮同一条等价关系——满足
 * audience 条件的赋值对应一条能看到该文本的 runtime 选择历史。
 */
const planFor = (source: readonly string[], target: number) =>
  planChoicesForLine(analyzeStoryFlow(parseScript(source)), target);

describe("planChoicesForLine", () => {
  it("returns an empty plan for scripts without decisions", () => {
    const result = planFor(["[name=A]第一句", "旁白一行", "[name=A]第三句"], 2);
    expect(result).toEqual({
      ok: true,
      plan: { choices: new Map(), degraded: false },
    });
  });

  it("reports not_found for command lines and unknown line numbers", () => {
    const source = ["[delay(time=1)]", '[name="A"]文本'];
    expect(planFor(source, 1)).toEqual({ ok: false, reason: "not_found" });
    expect(planFor(source, 99)).toEqual({ ok: false, reason: "not_found" });
  });

  it("only matches the last line of a multiline run, not its fragments", () => {
    const source = [
      '[multiline(name="A")]第一段', // line 1
      "[multiline]第二段", // line 2
      "[multiline(end=true)]第三段", // line 3 — 合成条目行号
    ];
    expect(planFor(source, 2)).toEqual({ ok: false, reason: "not_found" });
    expect(planFor(source, 3).ok).toBe(true);
  });

  it("keeps the plan empty when the default first option reaches the target", () => {
    const source = [
      '[decision(options="A;B",values="1;2")]', // line 1
      '[name="A路"]默认可达', // line 2（value=1）
      '[predicate(references="2")]', // line 3
      '[name="B路"]只有选 B 才到', // line 4
    ];
    expect(planFor(source, 2)).toEqual({
      ok: true,
      plan: { choices: new Map(), degraded: false },
    });
  });

  it("picks the required option when the target is gated behind it", () => {
    const source = [
      '[decision(options="A;B",values="1;2")]', // line 1
      '[name="A路"]默认文本', // line 2
      '[predicate(references="2")]', // line 3
      '[name="B路"]分支文本', // line 4
    ];
    const result = planFor(source, 4);
    expect(result).toEqual({
      ok: true,
      plan: { choices: new Map([[1, 1]]), degraded: false },
    });
  });

  it("prefers the first option for decisions that do not affect the target", () => {
    const source = [
      '[decision(options="X;Y",values="1;2")]', // line 1 — 与目标无关
      '[decision(options="A;B",values="1;2")]', // line 2
      '[name="公共"]两句公共文本', // line 3
      '[predicate(references="2")]', // line 4
      '[name="B路"]分支', // line 5
    ];
    const result = planFor(source, 5);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // 方案里只有 gate 需要的 decision；无关 decision 走默认第 0 项
    expect(result.plan.choices.get(2)).toBe(1);
    expect(result.plan.choices.has(1)).toBe(false);
  });

  it("passes through nested decisions and picks both required options", () => {
    const source = [
      '[decision(options="A;B",values="1;2")]', // line 1
      '[name="公共"]开头', // line 2
      '[predicate(references="2")]', // line 3
      '[decision(options="C;D",values="5;6")]', // line 4（只在 B 路执行）
      '[predicate(references="6")]', // line 5
      '[name="深处"]嵌套分支深处', // line 6
    ];
    const result = planFor(source, 6);
    expect(result).toEqual({
      ok: true,
      plan: {
        choices: new Map([
          [1, 1],
          [4, 1],
        ]),
        degraded: false,
      },
    });
  });
});

/** 只实现 decision-policy 测试脚本会用到的渲染方法（其余走不到） */
class DecisionFakeRenderer {
  decisionCalls: { options: string[]; values: number[] } = {
    options: [],
    values: [],
  };
  decisionPanelShown = 0;
  showItemKeys: string[] = [];
  lastDialogue = { speaker: "", text: "" };

  async showDecision(
    options: readonly string[],
    values: readonly number[],
  ): Promise<DecisionSelection> {
    this.decisionPanelShown += 1;
    this.decisionCalls = { options: [...options], values: [...values] };
    return { optionIndex: 0, value: values[0] ?? 0 };
  }

  async showItem(input: ShowItemInput): Promise<void> {
    this.showItemKeys.push(input.key);
  }

  setDialogue(speaker: string, text: string): void {
    this.lastDialogue = { speaker, text };
  }

  destroy(): void {}
}

const asRenderer = (fake: DecisionFakeRenderer): StoryRenderer =>
  fake as unknown as StoryRenderer;

/** 这些脚本没有任何音频指令，全部方法空实现即可 */
class NoopAudio implements StoryAudio {
  destroy(): void {}
  playMusic(): Promise<void> {
    return Promise.resolve();
  }
  playSound(): Promise<void> {
    return Promise.resolve();
  }
  setMusicVolume(): Promise<void> {
    return Promise.resolve();
  }
  setSoundVolume(): Promise<void> {
    return Promise.resolve();
  }
  stopMusic(): Promise<void> {
    return Promise.resolve();
  }
  stopSound(): Promise<void> {
    return Promise.resolve();
  }
}

const audio: StoryAudio = new NoopAudio();

const createContext = (script: readonly string[]): Context => ({
  linkMap: {},
  script,
});

describe("StoryRuntime decision policy", () => {
  it("auto-picks via the injected policy without showing the panel", async () => {
    const fake = new DecisionFakeRenderer();
    const runtime = new StoryRuntime(
      createContext([
        '[decision(options="A;B",values="1;2")]', // line 1
        '[predicate(references="2")]', // line 2
        '[showitem(image="right")]', // line 3 — 只在选 B 后执行
        '[predicate(references="1;2")]', // line 4
        '[name="A"]done', // line 5
      ]),
      asRenderer(fake),
      audio,
    );

    const seen: number[] = [];
    runtime.setDecisionPolicy((decision) => {
      seen.push(decision.decisionId);
      expect(decision.options).toEqual(["A", "B"]);
      expect(decision.values).toEqual([1, 2]);
      return 1;
    });

    await runtime.start();

    expect(seen).toEqual([1]);
    expect(fake.decisionPanelShown).toBe(0); // 面板从未出现
    expect(fake.showItemKeys).toEqual(["right"]);
    expect(runtime.getDecisionSelectValue()).toBe(2);
    expect(runtime.getLogPosition().selections).toEqual([
      { decisionId: 1, optionIndex: 1, value: 2 },
    ]);
    expect(fake.lastDialogue).toEqual({ speaker: "A", text: "done" });
  });

  it("falls back to the panel when the policy returns null or an invalid index", async () => {
    const nullPolicy = new DecisionFakeRenderer();
    const first = new StoryRuntime(
      createContext(['[decision(options="A;B",values="1;2")]', '[name="A"]x']),
      asRenderer(nullPolicy),
      audio,
    );
    first.setDecisionPolicy(() => null);
    await first.start();
    expect(nullPolicy.decisionPanelShown).toBe(1);
    expect(first.getLogPosition().selections).toEqual([
      { decisionId: 1, optionIndex: 0, value: 1 },
    ]);

    const outOfRange = new DecisionFakeRenderer();
    const second = new StoryRuntime(
      createContext(['[decision(options="A;B",values="1;2")]', '[name="A"]x']),
      asRenderer(outOfRange),
      audio,
    );
    second.setDecisionPolicy(() => 99); // 越界 → 回落面板
    await second.start();
    expect(outOfRange.decisionPanelShown).toBe(1);
  });

  it("stops intercepting after the policy is reset to null", async () => {
    const fake = new DecisionFakeRenderer();
    const runtime = new StoryRuntime(
      createContext(['[decision(options="A;B",values="1;2")]', '[name="A"]x']),
      asRenderer(fake),
      audio,
    );

    runtime.setDecisionPolicy(() => 1);
    runtime.setDecisionPolicy(null);
    await runtime.start();
    expect(fake.decisionPanelShown).toBe(1);
  });
});
