<script setup lang="ts">
import { computed } from "vue";

import { NText } from "naive-ui";

import { TRUE_CONDITION } from "../engine/log/condition";
import { formatConditionLabel } from "../engine/log/document";

import type {
  LogBlock,
  LogChoiceBlock,
  LogConditionalBlock,
  LogDocument,
  LogLineEntry,
} from "../engine/log/types";
import type { RuntimeChoiceSelection } from "../engine/types";

/**
 * 时间线式 Log All 列表（无外壳）：按 blocks 顺序渲染 LogDocument。
 * 外层全屏壳由 LogAllPanel 负责。
 *
 * 渲染模型：
 * - lines → 普通文本行（可带路径条件高亮）；
 * - choice → 一行选择记录，当前路径所选选项高亮；
 * - conditional → 带标签的条件区块，不在当前路径上的区块淡化。
 */
const props = defineProps<{
  document: LogDocument;
  /** 要渲染的 block 列表；递归渲染条件区块的子层时传入，默认为顶层 */
  blocks?: LogBlock[];
  /** 当前屏幕正在显示的源行 lineNumber；命中时高亮并供外层滚动定位 */
  activeLineIndex?: number | null;
  /** runtime 实际执行过的选择历史，用于求值当前路径 */
  selections?: RuntimeChoiceSelection[];
}>();

const renderBlocks = computed(() => props.blocks ?? props.document.blocks);

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
  props.document.conditions.evaluatePartial(audience, assignment.value);

const isActiveLine = (entry: LogLineEntry, audience: number): boolean =>
  props.activeLineIndex != null &&
  entry.lineIndex === props.activeLineIndex &&
  onPath(audience) !== false;

const optionSelected = (block: LogChoiceBlock, optionIndex: number): boolean =>
  assignment.value.get(block.decisionId) === optionIndex;

const choiceSelected = (block: LogChoiceBlock): boolean =>
  assignment.value.has(block.decisionId);

const conditionalLabel = (block: LogConditionalBlock): string =>
  formatConditionLabel(
    props.document.conditions.describe(block.audience),
    props.document.decisions,
  );

/** 不在当前路径上的条件区块整体淡化（内容仍可阅读） */
const conditionalOff = (block: LogConditionalBlock): boolean =>
  block.audience !== TRUE_CONDITION && onPath(block.audience) === false;
</script>

<template>
  <ul v-if="renderBlocks.length > 0" class="m-0 list-none p-0 space-y-2.5">
    <li v-for="(block, i) in renderBlocks" :key="i" class="p-0">
      <!-- 文本区块：audience 相同的连续行 -->
      <template v-if="block.kind === 'lines'">
        <div
          v-for="(entry, j) in block.entries"
          :key="j"
          :data-active-line="
            isActiveLine(entry, block.audience) ? '' : undefined
          "
          class="flex items-start leading-relaxed"
        >
          <NText
            tag="span"
            type="primary"
            class="inline-block w-5 shrink-0 text-center"
            :aria-label="
              isActiveLine(entry, block.audience) ? '当前播放位置' : undefined
            "
            :aria-hidden="
              isActiveLine(entry, block.audience) ? undefined : true
            "
          >
            {{ isActiveLine(entry, block.audience) ? "▶" : "" }}
          </NText>
          <NText
            v-if="entry.speaker"
            type="primary"
            tag="strong"
            class="mr-3 w-24 shrink-0 text-right"
          >
            {{ entry.speaker }}
          </NText>
          <span v-else class="mr-3 w-24 shrink-0" aria-hidden="true" />
          <span class="min-w-0 flex-1">
            <span
              v-for="(span, si) in entry.spans"
              :key="si"
              :style="span.color ? { color: span.color } : undefined"
              :class="
                !span.color && entry.source === 'narration'
                  ? 'opacity-75'
                  : undefined
              "
              >{{ span.text }}</span
            >
          </span>
        </div>
      </template>

      <!-- 选择记录：时间线上的一行，当前路径所选选项高亮 -->
      <div
        v-else-if="block.kind === 'choice'"
        class="flex flex-wrap items-baseline"
      >
        <NText type="primary" tag="strong" class="mr-2 shrink-0"
          >剧情选择</NText
        >
        <span class="shrink-0">
          <template v-for="(option, oi) in block.options" :key="oi">
            <span v-if="oi > 0"> / </span>
            <span
              :class="
                optionSelected(block, option.optionIndex)
                  ? 'rounded bg-primary/15 px-1 font-semibold'
                  : undefined
              "
              >{{ option.label }}</span
            >
          </template>
        </span>
        <NText v-if="block.inert" depth="3" class="ml-2 text-xs">
          {{ block.options.length > 1 ? "选择不影响后续剧情" : "无分支" }}
        </NText>
        <NText
          v-else-if="!choiceSelected(block)"
          depth="3"
          class="ml-2 text-xs"
        >
          各选项后续文本见下方分栏
        </NText>
      </div>

      <!-- 条件区块：带标签的分支内容，非当前路径淡化 -->
      <div
        v-else
        class="conditional-block border-primary/40 border-l-2 py-1 pl-3"
        :class="conditionalOff(block) ? 'opacity-40' : undefined"
      >
        <div class="mb-1.5 text-xs font-bold tracking-[0.06em] opacity-70">
          {{ conditionalLabel(block) }}：
        </div>
        <LogAllList
          :document="document"
          :blocks="block.blocks"
          :active-line-index="activeLineIndex"
          :selections="selections"
        />
      </div>
    </li>
  </ul>
  <NText v-else tag="p" depth="3" class="m-0 text-sm tracking-[0.03em]">
    没有可显示的对话文本。
  </NText>
</template>

<style scoped>
ul,
li {
  list-style: none !important;
}

li::marker {
  content: none !important;
}
</style>
