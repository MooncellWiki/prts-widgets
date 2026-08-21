import { TRUE_CONDITION, type DisplayCondition } from "./condition";
import { entryContentKey } from "./textEntry";

import type {
  DecisionId,
  LogBlock,
  LogConditionalBlock,
  LogDocument,
  LogLineEntry,
  LogLineBlock,
  OptionIndex,
  StoryFlowResult,
} from "./types";

/**
 * Graph → Log Document 投影。
 *
 * 状态 DAG 是语义真相，但不直接交给 UI：这里把 emissions 按源脚本顺序
 * 排列、合并同源文本的 audience、把覆盖全部可达历史的 audience 规范成
 * TRUE，再把连续相同条件的 block 包成 ConditionalBlock。
 * 不尝试把内容重建为 decision 嵌套树。
 */

export function buildLogDocument(flow: StoryFlowResult): LogDocument {
  const { conditions, decisions, emissions } = flow;

  // 每个 decision 的可达选项域，供 audience 规范化使用
  const domains = new Map<DecisionId, readonly OptionIndex[]>();
  for (const decision of decisions.values())
    domains.set(
      decision.decisionId,
      decision.options.map((option) => option.optionIndex),
    );

  const normalizeCache = new Map<number, number>();
  const normalizeAudience = (audience: number): number => {
    const cached = normalizeCache.get(audience);
    if (cached !== undefined) return cached;
    const simplified = conditions.normalizeByDomains(audience, domains);
    const normalized = conditions.isTautology(simplified, domains)
      ? TRUE_CONDITION
      : simplified;
    normalizeCache.set(audience, normalized);
    return normalized;
  };

  // 1. 按行号排序（生成顺序为稳定 tie-break）
  const sorted = [...emissions].sort((a, b) => a.lineIndex - b.lineIndex);

  // 2. 同一 lineIndex + 相同内容的文本合并 audience（同一源对白只留一份）。
  //    合并必须等同一行号的所有重复收集完再计算 audience。
  const textItems = new Map<
    string,
    { audienceIds: number[]; entry: LogLineEntry }
  >();
  const ordered: (
    | {
        kind: "choice";
        emission: Extract<(typeof sorted)[number], { kind: "choice" }>;
      }
    | { kind: "text"; key: string }
  )[] = [];

  for (const emission of sorted) {
    if (emission.kind === "choice") {
      ordered.push({ emission, kind: "choice" });
      continue;
    }
    const key = entryContentKey(emission.entry);
    const existing = textItems.get(key);
    if (existing) {
      existing.audienceIds.push(emission.audience);
      continue;
    }
    textItems.set(key, {
      audienceIds: [emission.audience],
      entry: emission.entry,
    });
    ordered.push({ key, kind: "text" });
  }

  // 3. 排列成 block：audience 相同的连续文本合并，choice 独立成块
  const flat: LogBlock[] = [];
  let currentLines: LogLineBlock | null = null;

  const closeLineBlock = (): void => {
    if (currentLines && currentLines.entries.length > 0)
      flat.push(currentLines);
    currentLines = null;
  };

  for (const item of ordered) {
    if (item.kind === "choice") {
      closeLineBlock();
      flat.push({
        audience: normalizeAudience(item.emission.audience),
        decisionId: item.emission.decisionId,
        // 先占位，等全部 audience 定下来再回填
        inert: false,
        kind: "choice",
        lineIndex: item.emission.lineIndex,
        options: item.emission.options,
      });
      continue;
    }

    const { audienceIds, entry } = textItems.get(item.key)!;
    const audience = normalizeAudience(conditions.or(audienceIds));
    if (currentLines && currentLines.audience === audience) {
      currentLines.entries.push(entry);
    } else {
      closeLineBlock();
      currentLines = { audience, entries: [entry], kind: "lines" };
    }
  }
  closeLineBlock();

  // 4. 回填 inert：规范化后的 audience 里还引用着某个 decision，才说明
  //    它真的分叉了（不影响可见性的 decision 已被 normalizeByDomains 投影掉）
  const branching = new Set<DecisionId>();
  for (const block of flat)
    for (const decisionId of conditions.referencedDecisions(block.audience))
      branching.add(decisionId);
  for (const block of flat)
    if (block.kind === "choice")
      block.inert =
        block.options.length <= 1 || !branching.has(block.decisionId);

  // 5. 连续相同（非全量）audience 的 block 包成条件区块
  return {
    blocks: wrapConditionalRuns(flat),
    conditions,
    decisions,
    degraded: flow.stats.degraded,
  };
}

function wrapConditionalRuns(flat: LogBlock[]): LogBlock[] {
  const output: LogBlock[] = [];
  let run: { audience: number; blocks: LogBlock[] } | null = null;

  const flush = (): void => {
    if (!run) return;
    const conditional: LogConditionalBlock = {
      audience: run.audience,
      blocks: run.blocks,
      kind: "conditional",
    };
    output.push(conditional);
    run = null;
  };

  for (const block of flat) {
    if (block.audience === TRUE_CONDITION) {
      flush();
      output.push(block);
      continue;
    }
    if (run && run.audience === block.audience) {
      run.blocks.push(block);
      continue;
    }
    flush();
    run = { audience: block.audience, blocks: [block] };
  }
  flush();
  return output;
}

/* ------------------------------------------------------------------ */
/* 消费侧工具：路径过滤与条件文案                                      */
/* ------------------------------------------------------------------ */

/** 展开文档为 (audience, entry) 序列；conditional 递归展开 */
function flattenBlocks(
  blocks: readonly LogBlock[],
): { audience: number; entry: LogLineEntry }[] {
  const output: { audience: number; entry: LogLineEntry }[] = [];
  for (const block of blocks) {
    if (block.kind === "lines") {
      output.push(
        ...block.entries.map((entry) => ({ audience: block.audience, entry })),
      );
    } else if (block.kind === "conditional") {
      output.push(...flattenBlocks(block.blocks));
    }
  }
  return output;
}

/**
 * 按一条完整选择历史过滤文档，得到该路径实际看到的文本序列。
 * assignment 必须覆盖历史中实际执行过的每个 decision。
 */
export function projectVisibleEntries(
  document: LogDocument,
  assignment: Map<DecisionId, OptionIndex>,
): LogLineEntry[] {
  return flattenBlocks(document.blocks)
    .filter(({ audience }) =>
      document.conditions.evaluate(audience, assignment),
    )
    .map(({ entry }) => entry);
}

/** 全文档的文本条目（不区分路径），用于回归对比与「导出全部文本」 */
export function collectAllEntries(document: LogDocument): LogLineEntry[] {
  return flattenBlocks(document.blocks).map(({ entry }) => entry);
}

/** 条件的展示文案；复杂条件退化为固定文案，底层条件不受影响 */
export function formatConditionLabel(
  display: DisplayCondition,
  decisions: Map<
    DecisionId,
    { options: { label: string; optionIndex: number }[] }
  >,
): string {
  if (display.kind === "always") return "全部路线";

  const optionLabel = (
    decisionId: DecisionId,
    optionIndex: OptionIndex,
  ): string =>
    decisions
      .get(decisionId)
      ?.options.find((option) => option.optionIndex === optionIndex)?.label ??
    `#${optionIndex + 1}`;

  const formatAlternative = (
    choices: readonly {
      decisionId: DecisionId;
      optionIndexes: readonly OptionIndex[];
    }[],
  ): string => {
    if (choices.length === 0) return "全部路线";
    const parts = choices.map((choice) =>
      choice.optionIndexes
        .map((index) => optionLabel(choice.decisionId, index))
        .join(" / "),
    );
    return `选择「${parts.join("」，随后选择「")}」`;
  };

  // 条件太散（或恒假这种不该出现的形状）就不逐条列了
  if (display.alternatives.length === 0 || display.alternatives.length > 4)
    return "部分选择路线";
  return display.alternatives
    .map((alternative) => formatAlternative(alternative.choices))
    .join("，或");
}
