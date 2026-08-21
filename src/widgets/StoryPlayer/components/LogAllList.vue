<script setup lang="ts">
import { computed } from "vue";

import { NText } from "naive-ui";

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
 * 外层全屏壳由 LogAllPanel 负责。
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
  /** 当前屏幕正在显示的源行 lineNumber；命中时高亮并供外层滚动定位 */
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
  <ul v-if="items.length > 0" class="m-0 list-none p-0 space-y-2.5">
    <li v-for="(item, i) in items" :key="i" class="p-0">
      <!-- 文本区块：audience 相同的连续行 -->
      <template v-if="item.kind === 'lines'">
        <div
          v-for="(row, j) in item.rows"
          :key="j"
          :data-active-line="row.active"
          class="flex items-start leading-relaxed"
        >
          <NText
            tag="span"
            type="primary"
            class="inline-block w-5 shrink-0 text-center"
            :aria-label="row.active ? '当前播放位置' : undefined"
            :aria-hidden="row.active ? undefined : true"
          >
            {{ row.active ? "▶" : "" }}
          </NText>
          <NText
            v-if="row.entry.speaker"
            type="primary"
            tag="strong"
            class="mr-3 w-24 shrink-0 text-right"
          >
            {{ row.entry.speaker }}
          </NText>
          <span v-else class="mr-3 w-24 shrink-0" aria-hidden="true" />
          <span class="min-w-0 flex-1">
            <span
              v-for="(span, si) in row.entry.spans"
              :key="si"
              :style="span.color ? { color: span.color } : undefined"
              :class="
                !span.color && row.entry.source === 'narration'
                  ? 'opacity-75'
                  : undefined
              "
              >{{ span.text }}</span
            >
          </span>
        </div>
      </template>

      <!-- 选择记录：与普通文本行同一套栅格，「剧情选择」占说话人槽，
           选项与备注进内容列，缩进与正文对齐 -->
      <div
        v-else-if="item.kind === 'choice'"
        class="flex items-start leading-relaxed"
      >
        <span class="w-5 shrink-0" aria-hidden="true" />
        <NText type="primary" tag="strong" class="mr-3 w-24 shrink-0 text-right"
          >剧情选择</NText
        >
        <span class="min-w-0 flex-1">
          <template v-for="(option, oi) in item.block.options" :key="oi">
            <span v-if="oi > 0"> / </span>
            <span
              :class="
                optionSelected(item.block, option.optionIndex)
                  ? 'choice-option-selected rounded px-1 font-semibold'
                  : undefined
              "
              >{{ option.label }}</span
            >
          </template>
          <NText v-if="item.block.inert" depth="3" class="ml-2 text-xs">
            {{
              item.block.options.length > 1 ? "选择不影响后续剧情" : "无分支"
            }}
          </NText>
          <NText
            v-else-if="!choiceSelected(item.block)"
            depth="3"
            class="ml-2 text-xs"
          >
            各选项后续文本见下方分栏
          </NText>
        </span>
      </div>

      <!-- 条件区块：带标签的分支内容，非当前路径淡化；标签行走同一套
           栅格，「选择「...」：」与正文/选项一样从内容列起排 -->
      <div
        v-else
        class="conditional-block py-1 pl-3"
        :class="item.off ? 'opacity-40' : undefined"
      >
        <div class="mb-1.5 flex leading-relaxed">
          <span class="w-5 shrink-0" aria-hidden="true" />
          <span class="mr-3 w-24 shrink-0" aria-hidden="true" />
          <span
            class="min-w-0 flex-1 text-xs font-bold tracking-[0.06em] opacity-70"
          >
            {{ item.label }}：
          </span>
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
  <NText v-else tag="p" depth="3" class="m-0 text-sm tracking-[0.03em]">
    没有可显示的对话文本。
  </NText>
</template>

<style scoped>
/* naive-ui 的 primary 不在 uno theme 里，border-primary/bg-primary 生成不了
   规则；主题色从最近的 naive 组件根（NCard/NModal）继承 --n-color-target。
   项目没有 preflight，border-width 初始值是 medium 而非 0：边框必须整体在
   这里声明（同 ArkSign 的 border-left 写法），不能只写 border-l-2 /
   border-solid 这类单属性 utility，否则其余三边会以默认宽度和 currentColor
   画出来 */
.conditional-block {
  border-left: 2px solid
    color-mix(in srgb, var(--n-color-target, #18a058) 40%, transparent);
}

.choice-option-selected {
  background-color: color-mix(
    in srgb,
    var(--n-color-target, #18a058) 15%,
    transparent
  );
}

ul,
li {
  list-style: none !important;
}

li::marker {
  content: none !important;
}
</style>
