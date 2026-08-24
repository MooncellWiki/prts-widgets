import { expandStoryText } from "../textVariables";

import type { ParsedCommandLine } from "../types";
import type { ChoiceOption } from "./types";

/**
 * 与 runtime 共享的 decision/predicate 纯语义。
 *
 * Native provenance:
 * - `Torappu.AVG.DecisionCommandPredicator.NeedToExecuteCommand`（闸门）
 * - `Torappu.AVG.DecisionPanel._ExecuteDecision`（先重置再校验 options）
 * - `Torappu.AVG.DecisionPanel._ExecutePredicate`（只替换 references）
 * - `Torappu.AVG.DecisionPanel._GetOptionValue`（越界取 0）
 *
 * `StoryRuntime.processLoop` 的闸门与 `executeCommand` 的 decision/predicate
 * case 直接调用这里，Log All 的符号分析也用同一组函数，两侧不会各自漂移。
 */

/** runtime 中路径的最小状态：单组可变 (selectedValue, references)，无栈 */
export interface RuntimeDecisionState {
  selectedValue: number;
  references: readonly number[] | null;
}

export function initialRuntimeDecisionState(): RuntimeDecisionState {
  return { selectedValue: 0, references: null };
}

function toStringValue(value: unknown, fallback = ""): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean")
    return String(value);
  return fallback;
}

function toIntList(value: unknown): number[] {
  return toStringValue(value)
    .split(";")
    .map((segment) => {
      const parsed = Number.parseInt(segment, 10);
      return Number.isNaN(parsed) ? 0 : parsed;
    });
}

/**
 * runtime 的执行闸门：选值为初始 0、references 为空时一律放行，
 * predicate 指令本身永远放行（它会更新 references，不能被旧闸门挡住）。
 */
export function passesGate(
  state: RuntimeDecisionState,
  line: { kind: string; command?: string },
): boolean {
  if (line.kind === "command" && line.command === "predicate") return true;
  if (state.selectedValue === 0) return true;
  if (state.references === null || state.references.length === 0) return true;
  return state.references.includes(state.selectedValue);
}

/**
 * 解析 decision 指令。
 *
 * runtime 在校验 options 之前就重置 selectedValue/references，
 * 无效 decision 也会清空状态，只是不产生选择。
 * 面板按 options 下标渲染按钮；values 缺项时取 0，与原生
 * `DecisionPanel._GetOptionValue` 的越界分支一致（它打
 * `Decision value index out of range` 并返回 0）。0 是「未选择」值，
 * 闸门对它恒放行，因此 options 比 values 多的脚本（如
 * story_ghost_2_1 的 4 选项 / 3 values）在原生里照常播下去。
 * 标签与 runtime 的 translateText 同源展开（如 `{@nickname}`），
 * 否则 Log All 会显示播放时不可见的字面占位符。
 *
 * `&` 禁用前缀（2.7.61 起）：原生 `DecisionPanel._SetupOptionText`
 * （0x183e718a0）对 `StartsWith("&")` 的选项 `Substring(1)` 剥前缀并置
 * `interactable=false`，剥完才进 `AVGTextManager.Translate`。这里在共享
 * 语义层同序处理（先剥 `&` 再 expandStoryText），使 runtime 面板与
 * Log All 显示同一份玩家可见文本。禁用项仍保留 optionIndex/value：
 * 原生 predicator 不感知禁用，Log All 的分支枚举也不排除它。
 */
export function parseDecision(
  line: ParsedCommandLine,
  variables: Record<string, unknown> = {},
): { options: ChoiceOption[] } | null {
  const optionsValue = line.args.options;
  if (optionsValue === undefined) return null;

  const labels = toStringValue(optionsValue).split(";");
  const values = toIntList(line.args.values);
  return {
    options: labels.map((label, optionIndex) => {
      const disabled = label.startsWith("&");
      return {
        disabled,
        label: expandStoryText(disabled ? label.slice(1) : label, variables),
        optionIndex,
        value: values[optionIndex] ?? 0,
      };
    }),
  };
}

/**
 * 解析 predicate 指令：无 references 参数 → null（结束分支模式），
 * 否则按 ";" 拆分（NaN 落到 0，与 runtime 一致）。
 */
export function parsePredicateReferences(
  line: ParsedCommandLine,
): number[] | null {
  if (line.args.references === undefined) return null;
  return toIntList(line.args.references);
}
