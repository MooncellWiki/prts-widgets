import { buildLogDocument } from "./document";
import { analyzeStoryFlow } from "./symbolicFlow";

import type { LogDocument } from "./types";
import type { ParsedLine } from "../types";

/**
 * 兼容入口：ParsedLine[] → LogDocument。
 *
 * 数据流：单行 runtime 语义 → 符号状态 DAG → 带路径条件的 emissions →
 * 顺序化 LogDocument → 时间线 UI。DAG 负责正确性，Document 负责阅读体验。
 */
export function buildLogAll(
  lines: readonly ParsedLine[],
  variables: Record<string, unknown> = {},
): LogDocument {
  return buildLogDocument(analyzeStoryFlow(lines, variables));
}
