<script setup lang="ts">
import { storeToRefs } from "pinia";

import { useExplorerStore } from "../store";
import {
  highlightParts,
  resourcePreview,
  thumbEdge,
  type Entry,
  type StoryResourceType,
} from "../utils";

import ResourceImage from "./ResourceImage.vue";

/**
 * 结果 · 大图：一格 = 缩略图 + 资源名（搜索词高亮）+ 剧本数。整格是按钮，点开详情。
 * 背景 / 图像是横图（16:9），角色 / 道具是方图，两种格子宽度不同。
 */
const store = useExplorerStore();
const { state } = store;
const { pageList, query, links, linksError, webp } = storeToRefs(store);

const wide = (type: StoryResourceType) =>
  type === "background" || type === "image";

/** 合并后的一格写 base（同一角色的几张立绘共用的前缀），否则写资源名本身 */
const title = (entry: Entry) =>
  entry.merged > 1 && entry.resource.base
    ? entry.resource.base
    : entry.resource.id;

const label = (entry: Entry) =>
  entry.merged > 1
    ? `${title(entry)}，${entry.merged} 张立绘，查看详情`
    : `${title(entry)}，${entry.count} 个剧本使用，查看详情`;
</script>

<template>
  <ul
    :class="['sae-cards', { 'sae-cards--wide': wide(state.type) }]"
    role="list"
  >
    <li v-for="entry in pageList" :key="entry.resource.id">
      <button
        type="button"
        class="sae-card"
        :aria-label="label(entry)"
        @click="store.open(entry.resource.id, entry.face)"
      >
        <span class="sae-card__thumb">
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
        </span>
        <span class="sae-card__body">
          <span class="sae-card__id" :title="entry.resource.id">
            <template
              v-for="(part, i) in highlightParts(title(entry), query.terms)"
              :key="i"
            >
              <mark v-if="part.hit">{{ part.text }}</mark>
              <template v-else>{{ part.text }}</template>
            </template>
          </span>
          <span class="sae-card__meta">
            <span v-if="entry.face" class="sae-card__face">
              表情 {{ entry.face }}
            </span>
            <span v-if="entry.merged > 1">
              <b>{{ entry.merged }}</b> 张立绘
            </span>
            <span
              ><b>{{ entry.count }}</b> 个剧本</span
            >
          </span>
        </span>
      </button>
    </li>
  </ul>
</template>

<style scoped lang="scss">
.sae-cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(148px, 1fr));
  gap: var(--ak-space-3);
  margin: 0;
  padding: 0;
  list-style: none;

  > li {
    margin: 0;
    min-width: 0;
  }

  &--wide {
    grid-template-columns: repeat(auto-fill, minmax(232px, 1fr));
  }

  // 手机上方图一行三格
  .sae--narrow & {
    grid-template-columns: repeat(auto-fill, minmax(104px, 1fr));
    gap: var(--ak-space-2);
  }

  .sae--narrow &--wide {
    grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  }
}

// 整格是按钮：抹掉宿主 / 浏览器给 <button> 的样子，自己画卡片
.sae-card {
  all: unset;
  box-sizing: border-box;
  position: relative;
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  background: var(--ak-bg-surface);
  border: 1px solid var(--ak-border);
  color: var(--ak-fg);
  cursor: pointer;
  transition: border-color var(--ak-dur-fast);

  &:hover {
    border-color: var(--ak-fg-muted);
  }

  // 悬停 / 聚焦：同设计系统选中态的左上角三角
  &:hover::before,
  &:focus-visible::before {
    content: "";
    position: absolute;
    top: 0;
    left: 0;
    z-index: 1;
    border-style: solid;
    border-width: 10px 10px 0 0;
    border-color: var(--ak-accent) transparent transparent;
  }

  &:focus-visible {
    outline: 2px solid var(--ak-focus);
    outline-offset: 2px;
  }

  &__thumb {
    position: relative;
    display: block;
    aspect-ratio: 1;
    background: var(--ak-bg-surface-2);
    border-bottom: 1px solid var(--ak-border-subtle);

    .sae-cards--wide & {
      aspect-ratio: 16 / 9;
    }
  }

  &__body {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 6px 8px 8px;
    min-width: 0;
  }

  &__id {
    font: 500 12px / 1.4 var(--ak-font-mono);
    overflow-wrap: anywhere;
    // 最多两行
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    overflow: hidden;

    mark {
      background: var(--ak-mark-bg);
      color: inherit;
    }
  }

  &__meta {
    display: flex;
    flex-wrap: wrap;
    gap: 0 8px;
    font-size: var(--ak-fs-xs);
    color: var(--ak-fg-muted);

    b {
      font-weight: 600;
      color: var(--ak-fg-secondary);
      font-variant-numeric: tabular-nums;
    }
  }

  &__face {
    color: var(--ak-fg);
    font-weight: 600;
  }
}
</style>
