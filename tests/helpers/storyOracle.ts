import { expandStoryText } from "../../src/widgets/StoryPlayer/engine/textVariables";

import type { ParsedLine } from "../../src/widgets/StoryPlayer/engine/types";

/**
 * 独立 runtime oracle：按行解释剧本、模拟一条具体玩家路径的小解释器。
 *
 * 与 src/.../engine/log/symbolicFlow.ts 是两套独立实现：oracle 用具体的
 * (selectedValue, references, pendingMultiline) 单实例状态直接走流程，
 * 不做任何符号分裂/合并。两者对同一剧本+同一选择历史必须给出完全一致
 * 的可见文本序列，这是全语料校验的 ground truth。
 *
 * 语义来源（与 runtime processLoop / DecisionPanel 逐条对齐）：
 * - 闸门：value≠0 且 references 非空时，只有 predicate 指令和命中
 *   references 的行能执行；
 * - decision 先重置 value=0/refs=null，options 参数缺失时不产生选择；
 * - 选项按钮按 options 下标渲染，values 缺项落到 index+1；
 * - 对白（含空对白）重置 multiline，空旁白不重置；
 * - multiline 空片段不动累积；sticker/subtitle 的 hidelog/multi 是
 *   web 日志侧规则。
 */

export interface OracleChoice {
  lineIndex: number;
  optionIndex: number;
  value: number;
}

export interface OracleEntry {
  lineIndex: number;
  speaker: string;
  source: "dialogue" | "multiline" | "narration" | "sticker" | "subtitle";
  text: string;
}

export interface OracleTrace {
  choices: OracleChoice[];
  entries: OracleEntry[];
}

export type ChoiceProvider = (lineIndex: number, optionCount: number) => number;

interface MultilineBuffer {
  name: string;
  text: string;
  lastLineIndex: number;
}

const toStringValue = (value: unknown, fallback = ""): string => {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean")
    return String(value);
  return fallback;
};

const toIntList = (value: unknown): number[] =>
  toStringValue(value)
    .split(";")
    .map((chunk) => {
      const parsed = Number.parseInt(chunk, 10);
      return Number.isNaN(parsed) ? 0 : parsed;
    });

export function executeStoryPath(
  lines: readonly ParsedLine[],
  choose: ChoiceProvider,
  variables: Record<string, unknown> = {},
): OracleTrace {
  let selectedValue = 0;
  let references: number[] | null = null;
  let pending: MultilineBuffer | null = null;
  // pending 会被 flush/append 闭包改写；经 getter 读取以绕开直线流收窄
  const peek = (): MultilineBuffer | null => pending;

  const choices: OracleChoice[] = [];
  const entries: OracleEntry[] = [];

  const flush = (): void => {
    if (pending && pending.text) {
      entries.push({
        lineIndex: pending.lastLineIndex,
        speaker: expandStoryText(pending.name, variables),
        source: "multiline",
        text: expandStoryText(pending.text, variables),
      });
    }
    pending = null;
  };

  const append = (
    lineIndex: number,
    speaker: string,
    text: string,
    source: OracleEntry["source"],
  ): void => {
    flush();
    if (text)
      entries.push({
        lineIndex,
        speaker: expandStoryText(speaker, variables),
        source,
        text: expandStoryText(text, variables),
      });
  };

  const blocked = (line: ParsedLine): boolean => {
    if (line.kind === "command" && line.command === "predicate") return false;
    if (selectedValue === 0) return false;
    if (references === null || references.length === 0) return false;
    return !references.includes(selectedValue);
  };

  for (const line of lines) {
    if (blocked(line)) continue;

    if (line.kind === "dialogue") {
      flush();
      append(line.lineNumber, line.speaker, line.text, "dialogue");
      continue;
    }

    if (line.kind === "narration") {
      if (!line.text) continue;
      append(line.lineNumber, "", line.text, "narration");
      continue;
    }

    switch (line.command) {
      case "decision": {
        flush();
        if (line.args.options === undefined) {
          selectedValue = 0;
          references = null;
          break;
        }
        const labels = toStringValue(line.args.options).split(";");
        const values = toIntList(line.args.values);
        const optionIndex = choose(line.lineNumber, labels.length);
        const value = values[optionIndex] ?? optionIndex + 1;
        selectedValue = value;
        references = null;
        choices.push({ lineIndex: line.lineNumber, optionIndex, value });
        break;
      }

      case "predicate": {
        references =
          line.args.references === undefined
            ? null
            : toIntList(line.args.references);
        break;
      }

      case "multiline": {
        const text = line.trailingText;
        if (!text) break;
        pending = {
          lastLineIndex: line.lineNumber,
          name: peek()?.name ?? toStringValue(line.args.name),
          text: (peek()?.text ?? "") + text,
        };
        if (line.args.end === true) flush();
        break;
      }

      case "sticker":
      case "subtitle": {
        if (line.args.hidelog === true) break;
        const text = toStringValue(line.args.text);
        if (!text) break;
        if (line.args.multi === true) {
          pending = {
            lastLineIndex: line.lineNumber,
            name: peek()?.name ?? "",
            text: (peek()?.text ?? "") + text,
          };
          break;
        }
        append(line.lineNumber, "", text, line.command);
        break;
      }

      case "dialog": {
        if (line.content)
          append(
            line.lineNumber,
            toStringValue(line.args.name),
            line.content,
            "dialogue",
          );
        break;
      }

      default: {
        break;
      }
    }
  }

  flush();
  return { choices, entries };
}

/** 枚举全部可达选择路径（按脚本顺序深度优先，选项按下标展开） */
export function enumerateOracleTraces(
  lines: readonly ParsedLine[],
  variables: Record<string, unknown> = {},
  maxTraces = 2000,
): OracleTrace[] {
  const traces: OracleTrace[] = [];

  const walk = (choices: OracleChoice[]): void => {
    if (traces.length >= maxTraces) return;

    let pendingDecision: { lineIndex: number; optionCount: number } | null =
      null;
    const wrapped: ChoiceProvider = (lineIndex, optionCount) => {
      const existing = choices.find((choice) => choice.lineIndex === lineIndex);
      if (existing) return existing.optionIndex;
      // 探路选择：先按第 0 项走，遇到新 decision 时由外层分裂
      pendingDecision = { lineIndex, optionCount };
      return 0;
    };

    const trace = executeStoryPath(lines, wrapped, variables);
    if (!pendingDecision) {
      traces.push(trace);
      return;
    }

    const { lineIndex, optionCount } = pendingDecision;
    for (let optionIndex = 0; optionIndex < optionCount; optionIndex += 1) {
      if (traces.length >= maxTraces) return;
      walk([...choices, { lineIndex, optionIndex, value: -1 }]);
    }
  };

  walk([]);
  return traces;
}
