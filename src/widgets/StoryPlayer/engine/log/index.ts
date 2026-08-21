import { buildLogDocument } from "./document";
import { analyzeStoryFlow } from "./symbolicFlow";

import type { LogDocument } from "./types";
import type { ParsedLine } from "../types";

/**
 * Log All 分析入口。
 *
 * 数据流：单行 runtime 语义（semantics）→ 符号状态 DAG（symbolicFlow）→
 * 带路径条件的 emissions → 顺序化 LogDocument（document）→ 时间线 UI。
 * DAG 负责正确性，Document 负责阅读体验。
 */
export function buildLogAll(
  lines: readonly ParsedLine[],
  variables: Record<string, unknown> = {},
): LogDocument {
  return buildLogDocument(analyzeStoryFlow(lines, variables));
}

export { ConditionStore, TRUE_CONDITION } from "./condition";
export type { DisplayCondition, DisplayAlternative } from "./condition";
export {
  buildLogDocument,
  collectAllEntries,
  formatConditionLabel,
  projectVisibleEntries,
} from "./document";
export { analyzeStoryFlow } from "./symbolicFlow";
export type { AnalyzeOptions } from "./symbolicFlow";
export type { FlowStats, StoryFlowResult } from "./types";
export type {
  ChoiceEmission,
  ChoiceOption,
  DecisionDefinition,
  DecisionId,
  LogBlock,
  LogChoiceBlock,
  LogConditionalBlock,
  LogDocument,
  LogEmission,
  LogLineBlock,
  LogLineEntry,
  LogLineSource,
  LogTextSpan,
  OptionIndex,
  TextEmission,
} from "./types";
