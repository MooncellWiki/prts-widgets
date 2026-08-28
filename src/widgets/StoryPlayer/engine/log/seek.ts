import type { DecisionId, OptionIndex, StoryFlowResult } from "./types";

/**
 * 行号跳转规划：给定 analyzeStoryFlow 的产物与目标行号，求一份「到达该行
 * 需要的选择方案」——decisionId → optionIndex。
 *
 * 正确性来源是 Log All 的既有等价关系（LogAllList 的 exact 高亮同款）：
 * 满足某文本 emission audience 条件的赋值，对应一条能看到该文本的 runtime
 * 选择历史。赋值用 ConditionStore.satisfyingAssignment 的贪心取法，天然
 * 满足「不影响到达的选择一律选第一个」；不在方案里的 decision 由调用方
 * 在播放时默认选第 0 项。
 *
 * 这是 Web 调试侧的纯静态计算，不属于原生 AVG 行为。
 */

export interface SeekPlan {
  /** 到达目标行必须按方案选择的 decision；表外 decision 默认选第 0 项 */
  choices: Map<DecisionId, OptionIndex>;
  /** 分析中途退化过（状态/条件超限）：方案可能不准，调用方应提示 */
  degraded: boolean;
}

export type SeekPlanResult =
  { ok: true; plan: SeekPlan } | { ok: false; reason: "not_found" };

export function planChoicesForLine(
  flow: StoryFlowResult,
  targetLineIndex: number,
): SeekPlanResult {
  // 目标行必须是某个文本 emission 的 lineIndex。multiline 合成条目只落在
  // 段末行号上，中间片段行号查不到——调用方应引导用户改填段末行号。
  const audiences = flow.emissions
    .filter(
      (emission) =>
        emission.kind === "text" && emission.lineIndex === targetLineIndex,
    )
    .map((emission) => emission.audience);

  if (audiences.length === 0) return { ok: false, reason: "not_found" };

  const domains = new Map<DecisionId, readonly OptionIndex[]>();
  for (const [decisionId, definition] of flow.decisions)
    domains.set(
      decisionId,
      definition.options.map((option) => option.optionIndex),
    );

  // 同一行号理论上只会有一个 emission（pending 按行去重），多个时任意
  // audience 都对应可达路径，取第一个能求出赋值的即可
  for (const audience of audiences) {
    const assignment = flow.conditions.satisfyingAssignment(audience, domains);
    if (assignment) {
      // optionIndex=0 的表项与「默认选第 0 项」等价，裁掉保持方案最小
      for (const [decisionId, optionIndex] of assignment)
        if (optionIndex === 0) assignment.delete(decisionId);
      return {
        ok: true,
        plan: { choices: assignment, degraded: flow.stats.degraded },
      };
    }
  }

  return { ok: false, reason: "not_found" };
}
