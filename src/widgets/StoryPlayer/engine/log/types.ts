import type { ConditionStore } from "./condition";

/**
 * Log All 分析的类型层。
 *
 * 数据流：
 * ParsedLine[] → (symbolicFlow) 带路径条件的 emissions → (document) 顺序化
 * LogDocument → (LogAllList.vue) 时间线 UI。
 *
 * 正确性由 symbolicFlow 的符号状态分析保证（严格复刻 runtime 的
 * decisionSelectValue/decisionReferences 过滤），阅读体验由 document 投影保证。
 * 两层解耦之后，predicate 属于哪个 decision 不再是需要回答的问题。
 */

/** decision 的身份：源脚本中该 decision 行的 lineNumber */
export type DecisionId = number;
/** decision 选项的身份：在 options 列表中的下标（value 只参与 runtime 闸门） */
export type OptionIndex = number;

/** decision 的一个选项 */
export interface ChoiceOption {
  /**
   * 是否为 `&` 禁用前缀选项（native `_SetupOptionText`：`StartsWith("&")` →
   * 剥前缀 + `interactable=false`）。禁用只作用于渲染层：选项仍占一个
   * optionIndex/value，Log All 的分支枚举不排除它（宁可多列也不丢行）。
   */
  disabled: boolean;
  /** 已剥掉 `&` 禁用前缀、展开变量后的显示文本 */
  label: string;
  optionIndex: OptionIndex;
  /** runtime 中玩家选择该选项后写入 decisionSelectValue 的值 */
  value: number;
}

/** 一个 decision 的静态定义（与路径无关） */
export interface DecisionDefinition {
  decisionId: DecisionId;
  /** decision 行的 lineNumber，与 decisionId 相同 */
  lineIndex: number;
  options: ChoiceOption[];
}

/* ------------------------------------------------------------------ */
/* 文本条目                                                            */
/* ------------------------------------------------------------------ */

export interface LogTextSpan {
  text: string;
  /** 来自 <color=#xxx> 标签；null 表示默认色 */
  color: string | null;
}

export type LogLineSource =
  "dialogue" | "multiline" | "narration" | "sticker" | "subtitle";

/** 文本条目：对白/旁白/sticker/subtitle/multiline 累积结果 */
export interface LogLineEntry {
  /** 源 ParsedLine.lineNumber；multiline 合成条目取最后一条指令的行号 */
  lineIndex: number;
  speaker: string;
  spans: LogTextSpan[];
  source: LogLineSource;
}

/* ------------------------------------------------------------------ */
/* 符号分析产物（emissions）                                           */
/* ------------------------------------------------------------------ */

/** 一条 decision 指令在部分路径上执行时产生的选择事件 */
export interface ChoiceEmission {
  kind: "choice";
  decisionId: DecisionId;
  lineIndex: number;
  /** 能执行到这条 decision 的全部路径条件之和 */
  audience: number;
  options: ChoiceOption[];
}

/** 一条对某部分路径可见的文本 */
export interface TextEmission {
  kind: "text";
  lineIndex: number;
  /** 能看到这段文本的路径条件 */
  audience: number;
  entry: LogLineEntry;
}

export type LogEmission = ChoiceEmission | TextEmission;

/** 分析规模统计，用于全语料回归时监控状态爆炸 */
export interface FlowStats {
  lineCount: number;
  decisionCount: number;
  peakStateCount: number;
  /** 内化过的不同路径条件数 */
  conditionCount: number;
  emissionCount: number;
  /** 状态数或条件乘积数超限、塌缩过：部分内容不再区分选择路线 */
  degraded: boolean;
}

export interface StoryFlowResult {
  emissions: LogEmission[];
  conditions: ConditionStore;
  decisions: Map<DecisionId, DecisionDefinition>;
  stats: FlowStats;
}

/* ------------------------------------------------------------------ */
/* Log Document IR                                                     */
/* ------------------------------------------------------------------ */

/** 一个 decision 在文档中的投影；inert 表示所有选项对后续可见内容无影响 */
export interface LogChoiceBlock {
  kind: "choice";
  decisionId: DecisionId;
  lineIndex: number;
  /** 能看到这个选择框的路径条件 */
  audience: number;
  options: ChoiceOption[];
  inert: boolean;
}

/** audience 相同的连续文本 */
export interface LogLineBlock {
  kind: "lines";
  audience: number;
  entries: LogLineEntry[];
}

/** 同一 audience（非全量）的连续 block 包成的条件区块 */
export interface LogConditionalBlock {
  kind: "conditional";
  audience: number;
  blocks: LogBlock[];
}

export type LogBlock = LogChoiceBlock | LogLineBlock | LogConditionalBlock;

export interface LogDocument {
  blocks: LogBlock[];
  decisions: Map<DecisionId, DecisionDefinition>;
  conditions: ConditionStore;
  /** 分析中途塌缩过状态：部分内容未按选择路线区分，UI 需要提示 */
  degraded: boolean;
}
