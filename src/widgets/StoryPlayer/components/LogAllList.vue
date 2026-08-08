<script setup lang="ts">
import { NText } from "naive-ui";

import type { LogAllDecisionRoute, LogAllEntry } from "../engine/logAll";

// 纯递归列表（无外壳）：渲染 LogAllEntry 树。
// 外层全屏壳由 LogAllPanel 负责，避免递归实例各自渲染一层全屏遮罩。
const props = defineProps<{
  entries: LogAllEntry[];
  /** 当前屏幕正在显示的源行 lineNumber；命中时高亮并供外层滚动定位 */
  activeLineIndex?: number | null;
  /** 最近一次 decision 玩家所选 value；用于只高亮当前路径上的分支副本 */
  decisionSelectValue?: number;
}>();

interface RouteGroup {
  labels: string[];
  values: number[];
  entries: LogAllEntry[];
}

function hasSameEntries(left: LogAllEntry[], right: LogAllEntry[]): boolean {
  return (
    left.length === right.length &&
    left.every((entry, index) => entry === right[index])
  );
}

/**
 * predicate(references="1;2") 等共享路径在 routes 中会分别投影给选项 1 和 2。
 * 展示时把完整结果相同的路径重新合并，任何一处内容不同则保持独立。
 */
function groupRoutes(routes: LogAllDecisionRoute[]): RouteGroup[] {
  const groups: RouteGroup[] = [];
  for (const route of routes) {
    const group = groups.find((candidate) =>
      hasSameEntries(candidate.entries, route.entries),
    );
    if (group) {
      group.labels.push(route.option.label);
      group.values.push(route.option.value);
    } else {
      groups.push({
        entries: route.entries,
        labels: [route.option.label],
        values: [route.option.value],
      });
    }
  }
  return groups;
}

function hasRouteContent(routes: LogAllDecisionRoute[]): boolean {
  return routes.some((route) => route.entries.length > 0);
}

/** 某条 line entry 是否对应当前屏幕正在显示的源行 */
function isActiveLine(entry: LogAllEntry & { kind: "line" }): boolean {
  return (
    props.activeLineIndex != null && entry.lineIndex === props.activeLineIndex
  );
}

/**
 * 把 activeLineIndex 透传给子列表时，需要先按 decision 选择过滤：
 * - decision 的 shared（选择前共同剧情）始终透传，因为无条件执行；
 * - 某条 route 仅当它覆盖的选项包含玩家所选值时才透传，避免分支副本误高亮。
 */
function routeActiveLineIndex(group: RouteGroup): number | null {
  if (
    props.decisionSelectValue &&
    group.values.includes(props.decisionSelectValue)
  )
    return props.activeLineIndex ?? null;
  return null;
}
</script>

<template>
  <ul v-if="entries.length > 0" class="m-0 list-none p-0 space-y-2.5">
    <li v-for="(entry, i) in entries" :key="i" class="p-0">
      <!-- 文本条目：对白 / 旁白 / sticker / subtitle / multiline -->
      <div
        v-if="entry.kind === 'line'"
        :data-active-line="isActiveLine(entry) ? '' : undefined"
        class="flex items-start leading-relaxed"
      >
        <NText
          tag="span"
          type="primary"
          class="inline-block w-5 shrink-0 text-center"
          :aria-label="isActiveLine(entry) ? '当前播放位置' : undefined"
          :aria-hidden="isActiveLine(entry) ? undefined : true"
        >
          {{ isActiveLine(entry) ? "▶" : "" }}
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

      <!-- 所有选项都立即汇合时，压成静态记录，不制造空折叠层。 -->
      <div
        v-else-if="!hasRouteContent(entry.routes)"
        class="border-l-2 py-1 pl-3"
      >
        <div class="text-sm">
          <NText type="primary" tag="strong" class="mr-2">剧情选择</NText>
          <span
            >「{{
              entry.options.map((option) => option.label).join(" / ")
            }}」</span
          >
          <NText depth="3" class="ml-2 text-xs">选择不影响后续剧情</NText>
        </div>
        <div v-if="entry.shared.length > 0" class="mt-2 pl-3">
          <LogAllList
            :entries="entry.shared"
            :active-line-index="activeLineIndex"
            :decision-select-value="decisionSelectValue"
          />
        </div>
      </div>

      <!-- 有实际分叉时，折叠树保留嵌套选择的路径关系。 -->
      <details v-else open class="group/decision border-l-2 pl-3">
        <summary
          class="cursor-pointer list-none py-1 text-sm font-bold marker:hidden"
        >
          <span
            class="mr-2 inline-block opacity-60 transition-transform group-open/decision:rotate-90"
            >▶</span
          >
          剧情选择
          <NText depth="3" class="ml-1 text-xs font-normal">
            （{{ entry.options.length }} 项）
          </NText>
        </summary>

        <div class="pb-1 pl-4 pt-2">
          <div v-if="entry.shared.length > 0" class="mb-3 border-l pl-3">
            <div
              class="mb-1.5 text-[11px] font-bold tracking-[0.08em] opacity-60"
            >
              选择前的共同剧情
            </div>
            <LogAllList
              :entries="entry.shared"
              :active-line-index="activeLineIndex"
              :decision-select-value="decisionSelectValue"
            />
          </div>

          <div class="space-y-2">
            <template
              v-for="(route, routeIndex) in groupRoutes(entry.routes)"
              :key="routeIndex"
            >
              <details
                v-if="route.entries.length > 0"
                class="group/route border-l pl-3"
              >
                <summary
                  class="cursor-pointer list-none py-1 text-sm font-semibold marker:hidden"
                >
                  <span
                    class="mr-2 inline-block opacity-55 transition-transform group-open/route:rotate-90"
                    >▶</span
                  >
                  选择「{{ route.labels.join(" / ") }}」
                  <span
                    v-if="route.labels.length > 1"
                    class="ml-1 text-xs font-normal opacity-60"
                  >
                    （相同去向）
                  </span>
                </summary>
                <div class="pb-2 pl-5 pt-1.5">
                  <LogAllList
                    :entries="route.entries"
                    :active-line-index="routeActiveLineIndex(route)"
                    :decision-select-value="decisionSelectValue"
                  />
                </div>
              </details>
              <div v-else class="border-l py-1 pl-3 text-sm opacity-75">
                <span class="mr-2 inline-block w-3 text-center opacity-60"
                  >—</span
                >
                <span class="font-semibold"
                  >选择「{{ route.labels.join(" / ") }}」</span
                >
                <span class="ml-2 text-xs">无专属文本，继续后续剧情</span>
                <span
                  v-if="route.labels.length > 1"
                  class="ml-1 text-xs opacity-60"
                >
                  （相同去向）
                </span>
              </div>
            </template>
          </div>
        </div>
      </details>
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
