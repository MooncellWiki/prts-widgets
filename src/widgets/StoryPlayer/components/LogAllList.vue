<script setup lang="ts">
import { computed } from "vue";

import {
  formatConditionLabel,
  TRUE_CONDITION,
  type LogBlock,
  type LogChoiceBlock,
  type LogConditionalBlock,
  type LogDocument,
  type LogLineBlock,
  type LogLineEntry,
} from "../engine/log";

import type { RuntimeChoiceSelection } from "../engine/types";

/**
 * 时间线式 Log All 列表（无外壳）：按 blocks 顺序渲染 LogDocument。
 * 滚动区和标题栏由 LogAllPanel 负责。
 *
 * 渲染模型：
 * - lines → 普通文本行（可带路径条件高亮）；
 * - choice → 一行选择记录，与文本行同一套栅格（「剧情选择」占说话人
 *   槽、选项进内容列）；在条件分栏内时随分栏统一淡化，可见性表达与
 *   普通文本一致，不单独标注（如 07-03 的「我们有什么计划？」只随
 *   「凯尔希，合作愉快。」分栏出现）；
 * - conditional → 带标签的条件区块，标签与内容列对齐，不在当前路径上的区块淡化。
 *
 * 路径条件按 block 求值一次并缓存在 items 里：播放中每 80ms 会同步一次
 * 状态，逐 entry 反复求值会让长剧本的列表明显发烫。
 */
const props = defineProps<{
  document: LogDocument;
  /** 要渲染的 block 列表；递归渲染条件区块的子层时传入，默认为顶层 */
  blocks?: LogBlock[];
  /**
   * 当前屏幕正在显示的源行 lineNumber；命中时高亮并供外层滚动定位。
   * 不传（undefined）表示没有播放进度可标（只加载文本），不留标记列；
   * null 表示在播放但还没有显示行
   */
  activeLineIndex?: number | null;
  /** runtime 实际执行过的选择历史，用于求值当前路径 */
  selections?: RuntimeChoiceSelection[];
}>();

/** 命中当前播放行：exact = 确实在当前路径上；maybe = 该分支尚未确定 */
type ActiveMark = "exact" | "maybe";

type RenderItem =
  | {
      kind: "lines";
      block: LogLineBlock;
      rows: { entry: LogLineEntry; active?: ActiveMark }[];
    }
  | { kind: "choice"; block: LogChoiceBlock }
  | {
      kind: "conditional";
      block: LogConditionalBlock;
      label: string;
      off: boolean;
    };

const renderBlocks = computed(() => props.blocks ?? props.document.blocks);

/** 说话人列只服务于带说话人的文本行和「剧情选择」行 */
function usesSpeakerColumn(blocks: readonly LogBlock[]): boolean {
  return blocks.some((block) => {
    if (block.kind === "choice") return true;
    if (block.kind === "lines")
      return block.entries.some((entry) => Boolean(entry.speaker));
    return usesSpeakerColumn(block.blocks);
  });
}

/**
 * 栅格列由顶层列表统一决定（子层通过 CSS 变量继承），保证各层缩进对齐：
 * 没有播放进度可标时不留标记列；整篇都是旁白、也没有选择时不留说话人
 * 列（如 EG-11 NBT），否则每行左边都空出一百多像素。
 */
const hasSpeakerColumn = computed(
  () => !props.blocks && usesSpeakerColumn(props.document.blocks),
);

const rootClass = computed(() =>
  props.blocks
    ? undefined
    : {
        "log-all-list--root": true,
        "log-all-list--no-marker": props.activeLineIndex === undefined,
        "log-all-list--no-speaker": !hasSpeakerColumn.value,
      },
);

const assignment = computed(
  () =>
    new Map(
      props.selections?.map((selection) => [
        selection.decisionId,
        selection.optionIndex,
      ]),
    ),
);

/** true/false/unknown(null)；false = 明确不在当前路径上 */
const onPath = (audience: number): boolean | null =>
  audience === TRUE_CONDITION
    ? true
    : props.document.conditions.evaluatePartial(audience, assignment.value);

/**
 * 当前播放行标记。同一行号可能在多个分支各有一条，exact 表示这一条确实
 * 在当前路径上，面板滚动优先定位到它。
 */
const activeMark = (
  entry: LogLineEntry,
  path: boolean | null,
): ActiveMark | undefined => {
  if (props.activeLineIndex == null || path === false) return undefined;
  if (entry.lineIndex !== props.activeLineIndex) return undefined;
  return path === true ? "exact" : "maybe";
};

const items = computed<RenderItem[]>(() =>
  renderBlocks.value.map((block) => {
    const path = onPath(block.audience);
    if (block.kind === "lines")
      return {
        kind: "lines",
        block,
        rows: block.entries.map((entry) => ({
          entry,
          active: activeMark(entry, path),
        })),
      };
    if (block.kind === "choice") return { kind: "choice", block };
    return {
      kind: "conditional",
      block,
      label: formatConditionLabel(
        props.document.conditions.describe(block.audience),
        props.document.decisions,
      ),
      off: block.audience !== TRUE_CONDITION && path === false,
    };
  }),
);

const optionSelected = (block: LogChoiceBlock, optionIndex: number): boolean =>
  assignment.value.get(block.decisionId) === optionIndex;

const choiceSelected = (block: LogChoiceBlock): boolean =>
  assignment.value.has(block.decisionId);
</script>

<template>
  <ul
    v-if="items.length > 0"
    class="log-all-list"
    :class="rootClass"
    role="list"
  >
    <li v-for="(item, i) in items" :key="i" class="log-item">
      <template v-if="item.kind === 'lines'">
        <div
          v-for="(row, j) in item.rows"
          :key="j"
          :data-active-line="row.active"
          :aria-current="row.active === 'exact' ? 'step' : undefined"
          class="log-row"
        >
          <span class="log-marker" aria-hidden="true">{{
            row.active ? "▶" : ""
          }}</span>
          <strong v-if="row.entry.speaker" class="log-speaker">
            {{ row.entry.speaker }}
          </strong>
          <span
            class="log-content"
            :class="{ 'log-narration': row.entry.source === 'narration' }"
          >
            <span
              v-for="(span, si) in row.entry.spans"
              :key="si"
              :style="{
                color: span.color ?? undefined,
                fontWeight: span.bold ? 'bold' : undefined,
                fontStyle: span.italic ? 'italic' : undefined,
              }"
              >{{ span.text }}</span
            >
          </span>
        </div>
      </template>

      <div v-else-if="item.kind === 'choice'" class="log-row">
        <strong class="log-speaker">剧情选择</strong>
        <div class="log-content">
          <span
            v-for="option in item.block.options"
            :key="option.optionIndex"
            class="log-choice-option"
            :class="{
              'log-choice-option--selected': optionSelected(
                item.block,
                option.optionIndex,
              ),
            }"
          >
            {{ option.label }}
          </span>
          <p v-if="item.block.inert" class="log-note">
            {{
              item.block.options.length > 1 ? "选择不影响后续剧情" : "无分支"
            }}
          </p>
          <p v-else-if="!choiceSelected(item.block)" class="log-note">
            各选项后续文本见下方分栏
          </p>
        </div>
      </div>

      <div v-else class="log-branch" :class="{ 'log-branch--off': item.off }">
        <div class="log-row log-branch-label">
          <span class="log-content">{{ item.label }}</span>
        </div>
        <LogAllList
          :document="document"
          :blocks="item.block.blocks"
          :active-line-index="activeLineIndex"
          :selections="selections"
        />
      </div>
    </li>
  </ul>
  <p v-else class="log-note">没有可显示的对话文本。</p>
</template>

<style scoped>
/* 保持各分支的标记、说话人与正文列对齐。 */
.log-all-list--root {
  --log-marker-width: 1.25rem;
  --log-speaker-width: 8rem;
  container-type: inline-size;
}

.log-all-list--no-marker {
  --log-marker-width: 0px;
}

.log-all-list--no-speaker {
  --log-speaker-width: 0px;
}

.log-all-list,
.log-item {
  margin: 0;
  padding: 0;
  list-style: none;
}

/* Minerva 额外给正文 ul 加左侧内距。 */
.log-all-list {
  padding-inline: 0 !important;
}

.log-item::marker {
  content: none;
}

.log-row {
  display: grid;
  grid-template-columns:
    var(--log-marker-width) var(--log-speaker-width)
    minmax(0, 1fr);
  align-items: start;
  padding: var(--ak-space-1) var(--ak-space-2);
  font-size: var(--ak-fs-sm);
}

.log-row[data-active-line] {
  background: var(--ak-accent-subtle);
  box-shadow: inset 2px 0 var(--ak-accent);
}

.log-marker {
  grid-column: 1;
  overflow: hidden;
  color: var(--ak-link);
  font-size: var(--ak-fs-xs);
}

.log-speaker {
  grid-column: 2;
  margin-right: var(--ak-space-3);
  color: var(--log-speaker-color, var(--ak-link));
  text-align: right;
}

.log-content {
  grid-column: 3;
  min-width: 0;
  overflow-wrap: anywhere;
}

.log-narration,
.log-note {
  color: var(--ak-fg-muted);
}

.log-note {
  margin: var(--ak-space-1) 0 0;
  font-size: var(--ak-fs-xs);
}

.log-choice-option {
  display: inline-block;
  margin: 0 var(--ak-space-1) var(--ak-space-1) 0;
  padding: 0 var(--ak-space-2);
  border: 1px solid var(--ak-border);
  background: var(--ak-bg-surface-2);
}

.log-choice-option--selected {
  border-color: var(--ak-accent);
  color: var(--ak-link);
  background: var(--ak-accent-subtle);
  font-weight: 700;
}

.log-branch {
  margin-block: var(--ak-space-2);
  padding-block: var(--ak-space-1);
  border-left: 2px solid var(--ak-accent-muted);
  background: var(--ak-bg-surface-2);
}

.log-branch--off {
  --log-speaker-color: var(--ak-fg-muted);
  color: var(--ak-fg-muted);
  border-left-color: var(--ak-border);
}

.log-branch-label {
  color: var(--ak-fg-muted);
  font-size: var(--ak-fs-xs);
  font-weight: 700;
}

@container (max-width: 30rem) {
  .log-row {
    grid-template-columns: var(--log-marker-width) minmax(0, 1fr);
  }

  .log-speaker {
    margin-right: 0;
    text-align: left;
  }

  .log-content {
    grid-column: 2;
  }
}
</style>
