import { describe, expect, it } from "vitest";

import { planChoicesForLine } from "../src/widgets/StoryPlayer/engine/log/seek";
import { analyzeStoryFlow } from "../src/widgets/StoryPlayer/engine/log/symbolicFlow";
import { parseScript } from "../src/widgets/StoryPlayer/engine/parser";
import { StoryRuntime } from "../src/widgets/StoryPlayer/engine/runtime";

import type { Context } from "../src/widgets/StoryPlayer/context";
import type {
  DecisionSelection,
  LineSeekUpdate,
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

  // 自动点击推进（advanceFromClick）必经，不打断打字机
  finishTextTyping(): boolean {
    return false;
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

/**
 * seekToLine 的编排：快速播放 + 自动选分支直达目标行。三种终态各测一遍，
 * 重点是「谁算人工干预」——脚本自身切播放模式（[theater]、隐式 endtip）
 * 不能被当成使用者干预，否则跳转会在半路无声中止并甩出错误文案。
 */
const seekRuntime = (script: readonly string[]): StoryRuntime =>
  new StoryRuntime(
    createContext(script),
    asRenderer(new DecisionFakeRenderer()),
    audio,
    // 自动点击的等待走注入的 sleep，测试里直接放行
    { sleep: () => Promise.resolve(), typingIntervalMs: 0 },
  );

/** 等到跳转推出终态；超时说明它卡住了，直接把已收到的通知报出来 */
async function waitForTerminal(
  updates: readonly LineSeekUpdate[],
): Promise<LineSeekUpdate> {
  for (let tick = 0; tick < 2000; tick += 1) {
    const terminal = updates.find((update) => update.phase !== "seeking");
    if (terminal) return terminal;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error(`seek did not settle: ${JSON.stringify(updates)}`);
}

/** 跳转期间被独占、收尾后要还回来的外层 decision 策略（选第 2 项） */
const outerPolicy = (): number => 1;

describe("StoryRuntime seekToLine", () => {
  it("fast-forwards to the target line and hands control back to manual", async () => {
    const runtime = seekRuntime([
      '[name="A"]一',
      '[name="A"]二',
      '[name="A"]三',
    ]);
    const updates: LineSeekUpdate[] = [];
    runtime.seekToLine(3, new Map(), (update) => updates.push(update));
    expect(updates).toEqual([{ phase: "seeking", target: 3 }]);

    await runtime.start();
    expect(await waitForTerminal(updates)).toEqual({
      phase: "reached",
      target: 3,
    });
    expect(runtime.getDisplayedLineIndex()).toBe(3);
    expect(runtime.getAutoPlayState().mode).toBe("default");
  });

  it("keeps seeking across [theater], which switches mode on its own", async () => {
    // [theater(mode=true)] 切 button_auto，(mode=false) 的缓存恢复又把
    // quick_play 映射回 default——两次都不是人工干预，跳转要照常推进
    const runtime = seekRuntime([
      "[theater(mode=true)]", // line 1
      '[name="A"]幕布里', // line 2
      "[theater(mode=false)]", // line 3
      '[name="A"]目标行', // line 4
    ]);
    const updates: LineSeekUpdate[] = [];
    runtime.seekToLine(4, new Map(), (update) => updates.push(update));

    await runtime.start();
    expect(await waitForTerminal(updates)).toEqual({
      phase: "reached",
      target: 4,
    });
  });

  it("reports missed when the whole script plays out without the target", async () => {
    // parser 会补一条隐式 endtip，它同样要切回手动——不能变成 aborted
    const runtime = seekRuntime(['[name="A"]一', '[name="A"]二']);
    const updates: LineSeekUpdate[] = [];
    runtime.seekToLine(999, new Map(), (update) => updates.push(update));

    await runtime.start();
    expect(await waitForTerminal(updates)).toEqual({
      phase: "missed",
      reason: "finished",
      target: 999,
    });
  });

  it("aborts when the user switches the play mode themselves", async () => {
    const runtime = seekRuntime(['[name="A"]一', '[name="A"]二']);
    const updates: LineSeekUpdate[] = [];
    runtime.seekToLine(2, new Map(), (update) => updates.push(update));

    runtime.setAutoPlayMode("default"); // 公开入口 = 使用者发起
    expect(updates.at(-1)).toEqual({ phase: "aborted", target: 2 });
  });

  it("cancels silently and gives the previously injected policy back", async () => {
    const runtime = seekRuntime([
      '[decision(options="A;B",values="1;2")]', // line 1
      '[name="A"]x', // line 2
    ]);
    runtime.setDecisionPolicy(outerPolicy);

    const updates: LineSeekUpdate[] = [];
    const cancel = runtime.seekToLine(2, new Map([[1, 0]]), (update) =>
      updates.push(update),
    );
    cancel();

    // 取消是静默的：只有武装时那条 seeking，没有终态
    expect(updates).toEqual([{ phase: "seeking", target: 2 }]);
    // 跳转期间被独占的策略还回来了：外层策略选第 2 项
    await runtime.start();
    expect(runtime.getLogPosition().selections).toEqual([
      { decisionId: 1, optionIndex: 1, value: 2 },
    ]);
  });
});
