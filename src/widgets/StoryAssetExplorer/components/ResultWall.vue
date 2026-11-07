<script setup lang="ts">
import { useExplorer, type Entry } from "../store";
import { resourcePreview, thumbEdge, type StoryResourceType } from "../utils";

import ResourceImage from "./ResourceImage.vue";

/**
 * 结果 · 小图：同改版前「剧情资源概览」的图墙——只有图，一格挨一格，一屏看得下上百张。
 * 资源名和剧本数放在悬停 / 聚焦的提示里（气泡由根组件画），读屏另给一遍文字；点开是详情。
 */
const store = useExplorer();
const { state, pageList, links, linksError, webp } = store;

const wide = (type: StoryResourceType) =>
  type === "background" || type === "image";

function tip(entry: Entry): string {
  const lines = [
    entry.merged > 1 && entry.resource.base
      ? entry.resource.base
      : entry.resource.id,
  ];
  if (entry.face) lines.push(`表情 ${entry.face}`);
  lines.push(
    entry.merged > 1
      ? `${entry.merged} 张立绘 · ${entry.count} 个剧本`
      : `${entry.count} 个剧本`,
  );
  return lines.join("\n");
}
</script>

<template>
  <ul :class="['sae-wall', { 'sae-wall--wide': wide(state.type) }]" role="list">
    <li v-for="entry in pageList" :key="entry.resource.id">
      <button
        type="button"
        class="sae-tile"
        :data-tip="tip(entry)"
        @click="store.open(entry.resource.id, entry.face)"
      >
        <ResourceImage
          :preview="
            resourcePreview(
              entry.resource.type,
              entry.resource.id,
              links,
              linksError,
            )
          "
          :thumb="thumbEdge(entry.resource.type)"
          :webp="webp"
          :fit="entry.resource.type === 'background' ? 'cover' : 'contain'"
        />
        <span
          v-if="entry.merged > 1"
          class="sae-tile__badge"
          aria-hidden="true"
        >
          {{ entry.merged }}
        </span>
        <span class="ak-sr-only">{{ tip(entry) }}</span>
      </button>
    </li>
  </ul>
</template>

<style scoped lang="scss">
// 一格挨一格（同改版前的图墙）：方图约 96、横图约 160 一列，列宽等分铺满整行
.sae-wall {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(88px, 1fr));
  gap: 2px;
  margin: 0;
  padding: 0;
  list-style: none;

  > li {
    margin: 0;
  }

  &--wide {
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  }

  .sae--narrow & {
    grid-template-columns: repeat(auto-fill, minmax(72px, 1fr));
  }

  .sae--narrow &--wide {
    grid-template-columns: repeat(auto-fill, minmax(128px, 1fr));
  }
}

.sae-tile {
  all: unset;
  box-sizing: border-box;
  position: relative;
  display: block;
  width: 100%;
  aspect-ratio: 1;
  cursor: pointer;

  .sae-wall--wide & {
    aspect-ratio: 16 / 9;
    background: var(--ak-bg-surface-2);
  }

  // 悬停：压一圈强调色的内框；聚焦：外侧焦点环（同敌人一览的头像视图）
  &::after {
    content: "";
    position: absolute;
    inset: 0;
    pointer-events: none;
  }

  &:hover::after {
    box-shadow: inset 0 0 0 2px var(--ak-accent);
  }

  &:focus-visible {
    outline: 2px solid var(--ak-focus);
    outline-offset: 0;
    z-index: 1;
  }

  // 合并了几张立绘：右下角一枚小计数
  &__badge {
    position: absolute;
    right: 2px;
    bottom: 2px;
    min-width: 16px;
    padding: 0 4px;
    font: 600 11px / 16px var(--ak-font-body);
    font-variant-numeric: tabular-nums;
    text-align: center;
    background: var(--ak-bg-inverse);
    color: var(--ak-fg-inverse);
    opacity: 0.85;
  }
}
</style>
