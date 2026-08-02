import { parseRichChars } from "./richtext";
import { expandStoryText } from "./textVariables";

import type { ParsedLine } from "./types";

/**
 * Log All 数据模型。
 *
 * 对齐本播放器 runtime 的实际播放行为（单层序列式过滤，无嵌套栈）：
 * - decision 让玩家选一个 value；
 * - 后续每个 predicate(references=X) 把脚本划成一段，仅当玩家所选值 ∈ X 时执行；
 * - 裸 [predicate]（无 references）结束分支模式。
 *
 * 因此 LogAll 把脚本整理为：顶层条目 + decision 节点（选项 + 共享段 + 各 predicate 分支段），
 * 与玩家实际能走到的路径一一对应，不展开未选择的分支也不引入嵌套怪癖。
 */

export interface LogAllTextSpan {
  text: string;
  /** 来自 <color=#xxx> 标签；null 表示默认色 */
  color: string | null;
}

export type LogAllLineSource =
  "dialogue" | "multiline" | "narration" | "sticker" | "subtitle";

/** 文本条目：对白/旁白/sticker/subtitle/multiline 累积结果 */
export interface LogAllLineEntry {
  kind: "line";
  /** 源 ParsedLine.lineNumber；multiline 合成条目取最后一条指令的行号。用于和 runtime 显示位置对齐 */
  lineIndex: number;
  speaker: string;
  spans: LogAllTextSpan[];
  source: LogAllLineSource;
}

/** decision 的一个分支段（由 predicate 划出） */
export interface LogAllBranch {
  /** 该分支段对应的 predicate references 值；与 runtime 的 decisionReferences 一致 */
  references: number[];
  /** references 映射回所属 decision 选项的文本，便于直接展示「选了哪些选项会看到这段」 */
  labels: string[];
  /** 分支段内条目（runtime 中玩家选值 ∈ references 时才执行这些） */
  entries: LogAllEntry[];
}

/** 从一个 decision 选项出发，玩家实际会依次看到的专属条目。 */
export interface LogAllDecisionRoute {
  option: { label: string; value: number };
  /** 按脚本顺序合并所有 references 包含该选项 value 的 predicate 段。 */
  entries: LogAllEntry[];
}

/** decision 节点：所有选项 + 共享段 + 各分支段 */
export interface LogAllDecisionEntry {
  kind: "decision";
  options: { label: string; value: number }[];
  /** decision 之后、第一个 predicate 之前的文本（runtime 中无条件执行） */
  shared: LogAllEntry[];
  /** 按 predicate 划分的分支段 */
  branches: LogAllBranch[];
  /** 面向展示的选项路径；每个选项直接对应其会执行的全部分支内容。 */
  routes: LogAllDecisionRoute[];
}

export type LogAllEntry = LogAllDecisionEntry | LogAllLineEntry;

interface MultilineAccumulator {
  name: string;
  text: string;
  /** 合成 entry 的 lineIndex，取最后一条累积指令的行号 */
  lineIndex: number;
}

/** 把含 <color=#xxx>...</color> 的文本拆成连续同色的 span */
function toSpans(
  text: string,
  variables: Record<string, unknown>,
): LogAllTextSpan[] {
  const chars = parseRichChars(expandStoryText(text, variables));
  if (chars.length === 0) return [];

  const spans: LogAllTextSpan[] = [];
  let buffer = "";
  let currentColor: string | null = null;

  const flush = (): void => {
    if (buffer) {
      spans.push({ text: buffer, color: currentColor });
      buffer = "";
    }
  };

  for (const { char, color } of chars) {
    if (color !== currentColor) {
      flush();
      currentColor = color;
    }
    buffer += char;
  }
  flush();
  return spans;
}

function toNumberList(value: unknown): number[] {
  if (typeof value !== "string") return [];

  return value.split(";").map((segment) => {
    const parsed = Number.parseInt(segment.trim(), 10);
    return Number.isNaN(parsed) ? 0 : parsed;
  });
}

function toStringList(value: unknown): string[] {
  if (typeof value !== "string") return [];

  return value.split(";");
}

/**
 * 静态预扫脚本，按 runtime 实际过滤行为整理 decision/predicate 分支。
 *
 * 用一个 target 栈跟踪「当前文本应落入的数组」：
 * - 默认栈底为 root（顶层流）；
 * - 进入 decision 时 push 该 decision.shared；
 * - predicate 在当前 decision 下新建分支段，target 栈顶替换为 branch.entries；
 * - 裸 [predicate] 弹栈到当前 decision 之外（对齐 runtime 结束分支模式）。
 * 嵌套 decision 因此天然支持：每个 decision 独立持有自己的 shared/branches。
 */
export function buildLogAll(
  lines: readonly ParsedLine[],
  variables: Record<string, unknown> = {},
): LogAllEntry[] {
  const root: LogAllEntry[] = [];
  let multilineAccum: MultilineAccumulator | null = null;
  /** 当前文本应 append 到的数组栈；栈底恒为 root */
  const targetStack: LogAllEntry[][] = [root];
  /** 与 targetStack 并行：每层对应的 decision 节点（栈底为 null） */
  const decisionStack: (LogAllDecisionEntry | null)[] = [null];

  const currentTarget = (): LogAllEntry[] => targetStack.at(-1)!;
  const currentDecision = (): LogAllDecisionEntry | null =>
    decisionStack.at(-1) ?? null;

  const flushMultiline = (): void => {
    if (!multilineAccum || !multilineAccum.text) return;

    currentTarget().push({
      kind: "line",
      lineIndex: multilineAccum.lineIndex,
      speaker: expandStoryText(multilineAccum.name, variables),
      spans: toSpans(multilineAccum.text, variables),
      source: "multiline",
    });
    multilineAccum = null;
  };

  const appendLine = (
    lineIndex: number,
    speaker: string,
    text: string,
    source: LogAllLineSource,
  ): void => {
    if (!text) return;

    flushMultiline();
    currentTarget().push({
      kind: "line",
      lineIndex,
      speaker: expandStoryText(speaker, variables),
      spans: toSpans(text, variables),
      source,
    });
  };

  for (const line of lines) {
    const lineIndex = line.lineNumber;
    if (line.kind === "dialogue") {
      appendLine(lineIndex, line.speaker, line.text, "dialogue");
      continue;
    }

    if (line.kind === "narration") {
      appendLine(lineIndex, "", line.text, "narration");
      continue;
    }

    // line.kind === 'command'
    switch (line.command) {
      case "decision": {
        flushMultiline();

        const labels = toStringList(line.args.options).map((label) =>
          expandStoryText(label, variables),
        );
        const values = toNumberList(line.args.values);
        if (labels.length === 0 || values.length === 0) break; // 无效 decision，按 runtime 行为忽略（runtime 会 warn 并 continue）

        const count = Math.min(labels.length, values.length);
        const options: { label: string; value: number }[] = [];
        for (let i = 0; i < count; i += 1)
          options.push({ label: labels[i], value: values[i] });

        const decision: LogAllDecisionEntry = {
          branches: [],
          kind: "decision",
          options,
          routes: options.map((option) => ({ entries: [], option })),
          shared: [],
        };
        currentTarget().push(decision);
        // 新 decision 的执行会覆盖 runtime 中上一组选值，但它本身仍受执行前的
        // predicate 闸门约束。因此若它出现在某个分支段内，结构上必须留在该
        // 分支路径里；随后再以新 decision 为 owner 解释它自己的 predicate。
        targetStack.push(decision.shared);
        decisionStack.push(decision);
        break;
      }

      case "predicate": {
        flushMultiline();

        // 裸 [predicate]（无 references）：runtime 设 decisionReferences=null，结束分支模式
        if (!line.paramPresent || line.args.references === undefined) {
          // 弹出当前 decision 层（若有），回到外层流
          if (targetStack.length > 1) {
            targetStack.pop();
            decisionStack.pop();
          }
          break;
        }

        const references = toNumberList(line.args.references);
        const owner = currentDecision();
        if (references.length === 0 || !owner) break; // 无 enclosing decision 或 references 为空：忽略

        // references 覆盖当前 decision 的全部选项时，这是常见的显式汇合点。
        // 从这里开始的内容对所有选项都相同，应回到 decision 的父级流；
        // 否则紧随其后的新 decision 会被错误显示成每条选项路径的子节点。
        if (
          owner.options.every((option) => references.includes(option.value))
        ) {
          targetStack.pop();
          decisionStack.pop();
          break;
        }

        // references 映射回所属 decision 的选项文本（value -> label）
        const labelByValue = new Map(
          owner.options.map((o) => [o.value, o.label]),
        );
        const labels = references
          .map((ref) => labelByValue.get(ref))
          .filter(Boolean);

        // 在当前 decision 下新建分支段，替换栈顶 target
        const branch: LogAllBranch = { entries: [], labels, references };
        owner.branches.push(branch);
        targetStack[targetStack.length - 1] = branch.entries;
        break;
      }

      case "multiline": {
        const text = line.trailingText;
        const name = typeof line.args.name === "string" ? line.args.name : "";
        if (!text) break;

        if (multilineAccum) {
          multilineAccum.text += text;
          multilineAccum.lineIndex = lineIndex;
        } else {
          multilineAccum = { lineIndex, name, text };
        }

        if (line.args.end === true) flushMultiline();
        break;
      }

      case "sticker":
      case "subtitle": {
        // PlaybackPanel and the reader-mode adapter both skip AddCell when
        // hidelog is set; the scene-side executor ignores the key entirely.
        if (line.args.hidelog === true) break;

        const text = typeof line.args.text === "string" ? line.args.text : "";
        if (!text) break;

        // multi=true 时累积进 multiline（对齐 runtime multiline 累积语义）
        if (line.args.multi === true) {
          if (multilineAccum) {
            multilineAccum.text += text;
            multilineAccum.lineIndex = lineIndex;
          } else {
            multilineAccum = { lineIndex, name: "", text };
          }
          break;
        }

        appendLine(lineIndex, "", text, line.command);
        break;
      }

      default: {
        // 其它纯控制命令（background/character/audio 等）不产生日志条目
        break;
      }
    }
  }

  flushMultiline();

  // route 创建时 branch.entries 尚为空；预扫结束后再按脚本顺序组装每条完整路径。
  const populateRoutes = (entries: LogAllEntry[]): void => {
    for (const entry of entries) {
      if (entry.kind !== "decision") continue;
      entry.routes = entry.options.map((option) => ({
        entries: entry.branches
          .filter((branch) => branch.references.includes(option.value))
          .flatMap((branch) => branch.entries),
        option,
      }));
      populateRoutes(entry.shared);
      for (const branch of entry.branches) populateRoutes(branch.entries);
    }
  };
  populateRoutes(root);
  return root;
}
