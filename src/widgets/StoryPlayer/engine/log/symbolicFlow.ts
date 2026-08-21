import { ConditionStore } from "./condition";
import {
  initialRuntimeDecisionState,
  parseDecision,
  parsePredicateReferences,
  passesGate,
} from "./semantics";
import { buildLineEntry, entryContentKey } from "./textEntry";

import type {
  ChoiceEmission,
  DecisionDefinition,
  LogEmission,
  LogLineEntry,
  StoryFlowResult,
} from "./types";
import type { ParsedLine } from "../types";

/**
 * 符号状态分析器：严格复刻 runtime 的单组 (decisionSelectValue,
 * decisionReferences) 过滤行为，为每条路径条件精确计算可见文本。
 *
 * 结构是一张按行分层的 DAG：同一行处理完后按 runtime 状态合并，
 * 「不同历史 + 相同当前状态」汇合成一个节点（condition 取 OR）。
 * 生产实现流式构建（只保留当前层状态与 emissions），不落完整
 * layers/transitions；统计信息保留规模监控。
 *
 * 与 runtime 的对齐点（修改 runtime 时必须同步）：
 * - gate：predicate 恒过；value=0 恒过；references 空恒过；
 * - decision 先重置 value/references 再校验 options（无效 decision 也重置）；
 * - 被闸门挡住的 decision 完全不执行，旧 value/references 原样保留；
 * - 对白显示重置 multiline 累积（空对白也重置），空旁白不重置；
 * - 闸门挡住的行不重置 multiline。
 *
 * multiline 累积是路径状态的一部分（受闸门控制的 multiline 只在部分
 * 路径执行），因此累积器按不可变对象处理，decision 分裂后各路径独立演化。
 */

/** 单条符号路径在某一行之前的完整状态 */
interface SymbolicState {
  condition: number;
  selectedValue: number;
  references: readonly number[] | null;
  multiline: MultilineAccumulator | null;
}

interface MultilineAccumulator {
  name: string;
  text: string;
  /** 合成 entry 的 lineIndex，取最后一条累积指令的行号 */
  lastLineIndex: number;
}

interface PendingText {
  entry: LogLineEntry;
  audiences: number[];
}

/** 状态合并键：runtime 状态 + 日志累积状态，不含路径条件 */
function stateKey(state: SymbolicState): string {
  const multiline =
    state.multiline === null
      ? "-"
      : `${state.multiline.lastLineIndex}\u{1}${state.multiline.name}\u{1}${state.multiline.text}`;
  const references =
    state.references === null ? "-" : state.references.join(",");
  return `${state.selectedValue}\u{2}${references}\u{2}${multiline}`;
}

const MAX_STATES = 10_000;

export function analyzeStoryFlow(
  lines: readonly ParsedLine[],
  variables: Record<string, unknown> = {},
): StoryFlowResult {
  const conditions = new ConditionStore();
  const decisions = new Map<number, DecisionDefinition>();
  /** 已遇到 decision 的全部选项下标；条件增量投影的可达域 */
  const domains = new Map<number, readonly number[]>();
  const emissions: LogEmission[] = [];

  let states: SymbolicState[] = [
    {
      condition: conditions.true(),
      multiline: null,
      ...initialRuntimeDecisionState(),
    },
  ];

  let peakStateCount = 1;
  let decisionCount = 0;

  const mergeStates = (): void => {
    const byKey = new Map<string, SymbolicState>();
    for (const state of states) {
      const key = stateKey(state);
      const existing = byKey.get(key);
      if (!existing) {
        byKey.set(key, state);
        continue;
      }
      existing.condition = conditions.or([existing.condition, state.condition]);
    }
    // 每行合并后立即按可达域投影。否则连续部分汇合会让条件按组合数
    // 增长（or 越滚越大），DNF 展开超限后 describe 只能退化成
    // 「部分选择路线」。就地投影后条件始终保持最小形态：
    // 全覆盖的 decision 被消掉，比如 or(D1=A∧D2=x, D1=B∧D2=x,
    // D1=C∧D2=x) → D2=x（每个走到这的玩家都在 D1 做过某种选择）。
    states = [...byKey.values()].map((state) => ({
      ...state,
      condition: conditions.normalizeByDomains(state.condition, domains),
    }));
    peakStateCount = Math.max(peakStateCount, states.length);
    if (states.length > MAX_STATES)
      throw new Error(
        `story log analysis exceeded ${MAX_STATES} symbolic states`,
      );
  };

  /** 收集当前行各状态产生的同内容文本，合并 audience 后只留一份 */
  const emitText = (
    state: SymbolicState,
    entry: LogLineEntry,
    pending: Map<string, PendingText>,
  ): void => {
    const key = entryContentKey(entry);
    const existing = pending.get(key);
    if (existing) existing.audiences.push(state.condition);
    else pending.set(key, { audiences: [state.condition], entry });
  };

  /** 把 state 的 pending multiline 落成文本条目并清空累积；返回新状态 */
  const withFlushedMultiline = (
    state: SymbolicState,
    pending: Map<string, PendingText>,
  ): SymbolicState => {
    if (!state.multiline || !state.multiline.text) return state;
    emitText(
      state,
      buildLineEntry(
        state.multiline.lastLineIndex,
        state.multiline.name,
        state.multiline.text,
        "multiline",
        variables,
      ),
      pending,
    );
    return { ...state, multiline: null };
  };

  /** flush pending multiline 后追加一条普通文本 */
  const appendLine = (
    state: SymbolicState,
    lineIndex: number,
    speaker: string,
    text: string,
    source: LogLineEntry["source"],
    pending: Map<string, PendingText>,
  ): SymbolicState => {
    if (!text) return state;
    const flushed = withFlushedMultiline(state, pending);
    emitText(
      flushed,
      buildLineEntry(lineIndex, speaker, text, source, variables),
      pending,
    );
    return flushed;
  };

  for (const line of lines) {
    const lineIndex = line.lineNumber;
    const pending = new Map<string, PendingText>();
    const nextStates: SymbolicState[] = [];

    for (const state of states) {
      if (!passesGate(state, line)) {
        // 闸门挡住：runtime 直接 continue，状态（含 multiline）原样保留
        nextStates.push(state);
        continue;
      }

      if (line.kind === "dialogue") {
        // 对白显示重置 multiline（空对白在 runtime 也走到 resetMultiline）
        nextStates.push(
          appendLine(
            state,
            lineIndex,
            line.speaker,
            line.text,
            "dialogue",
            pending,
          ),
        );
        continue;
      }

      if (line.kind === "narration") {
        // 空旁白在 runtime 直接 continue，不重置 multiline
        nextStates.push(
          appendLine(state, lineIndex, "", line.text, "narration", pending),
        );
        continue;
      }

      switch (line.command) {
        case "decision": {
          // pending multiline 属于选择前的观众，必须以选择前条件 flush
          const flushed = withFlushedMultiline(state, pending);
          const parsed = parseDecision(line);
          if (!parsed) {
            // 无效 decision：runtime 已重置 value/references，但不产生选择
            nextStates.push({
              ...flushed,
              references: null,
              selectedValue: 0,
            });
            break;
          }

          if (!decisions.has(lineIndex)) {
            decisions.set(lineIndex, {
              decisionId: lineIndex,
              lineIndex,
              options: parsed.options,
            });
            domains.set(
              lineIndex,
              parsed.options.map((option) => option.optionIndex),
            );
            decisionCount += 1;
          }
          for (const option of parsed.options) {
            nextStates.push({
              condition: conditions.and(
                flushed.condition,
                conditions.choice(lineIndex, option.optionIndex),
              ),
              references: null,
              selectedValue: option.value,
              multiline: flushed.multiline,
            });
          }
          break;
        }

        case "predicate": {
          // predicate 恒过闸门；pending multiline 的观众条件不受影响
          nextStates.push({
            ...state,
            references: parsePredicateReferences(line),
          });
          break;
        }

        case "multiline": {
          const text = line.trailingText;
          if (!text) {
            // runtime 只清空对话框，不动累积
            nextStates.push(state);
            break;
          }
          const base = state.multiline ?? {
            lastLineIndex: lineIndex,
            name: typeof line.args.name === "string" ? line.args.name : "",
            text: "",
          };
          let next: SymbolicState = {
            ...state,
            multiline: {
              ...base,
              lastLineIndex: lineIndex,
              text: base.text + text,
            },
          };
          if (line.args.end === true)
            next = withFlushedMultiline(next, pending);
          nextStates.push(next);
          break;
        }

        case "sticker":
        case "subtitle": {
          // hidelog 是 web 日志侧的过滤（播放面板与阅读模式都跳过）
          if (line.args.hidelog === true) {
            nextStates.push(state);
            break;
          }
          const text = typeof line.args.text === "string" ? line.args.text : "";
          if (!text) {
            nextStates.push(state);
            break;
          }
          if (line.args.multi === true) {
            // multi=true 时按 multiline 语义累积（web 日志约定）
            const base = state.multiline ?? {
              lastLineIndex: lineIndex,
              name: "",
              text: "",
            };
            nextStates.push({
              ...state,
              multiline: {
                ...base,
                lastLineIndex: lineIndex,
                text: base.text + text,
              },
            });
            break;
          }
          nextStates.push(
            appendLine(state, lineIndex, "", text, line.command, pending),
          );
          break;
        }

        case "dialog": {
          // `[Dialog(text)]` / `[imagegroup=..]文本` 等落到 dialog 哨兵命令；
          // 只有带 content 的才像对白一样显示并重置 multiline
          nextStates.push(
            line.content
              ? appendLine(
                  state,
                  lineIndex,
                  typeof line.args.name === "string" ? line.args.name : "",
                  line.content,
                  "dialogue",
                  pending,
                )
              : state,
          );
          break;
        }

        default: {
          // 其它控制命令不产生日志条目，也不动日志状态
          nextStates.push(state);
          break;
        }
      }
    }

    // decision 行产生一个 choice emission（audience = 执行该 decision 的
    // 全部状态条件之和）；被闸门挡住的路径看不到这个选择框。
    if (line.kind === "command" && line.command === "decision") {
      const parsed = parseDecision(line);
      const executing = states.filter((state) => passesGate(state, line));
      if (parsed && executing.length > 0) {
        const choiceEmission: ChoiceEmission = {
          audience: conditions.or(executing.map((state) => state.condition)),
          decisionId: lineIndex,
          kind: "choice",
          lineIndex,
          options: parsed.options,
        };
        emissions.push(choiceEmission);
      }
    }

    states = nextStates;
    mergeStates();

    for (const { audiences, entry } of pending.values()) {
      emissions.push({
        audience: conditions.or(audiences),
        entry,
        kind: "text",
        lineIndex: entry.lineIndex,
      });
    }
  }

  // 脚本结束：各路径剩余的 multiline 累积各自成条
  const tail = new Map<string, PendingText>();
  for (const state of states) withFlushedMultiline(state, tail);
  for (const { audiences, entry } of tail.values()) {
    emissions.push({
      audience: conditions.or(audiences),
      entry,
      kind: "text",
      lineIndex: entry.lineIndex,
    });
  }

  return {
    conditions,
    decisions,
    emissions,
    stats: {
      conditionNodeCount: conditions.nodeCount,
      decisionCount,
      emissionCount: emissions.length,
      lineCount: lines.length,
      peakStateCount,
    },
  };
}
