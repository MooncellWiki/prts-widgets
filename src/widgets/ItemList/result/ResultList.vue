<script setup lang="ts">
import { storeToRefs } from "pinia";

import { useItemListStore } from "../store";

import ItemIcon from "./ItemIcon.vue";

/**
 * 结果 · 列表：一行一件道具，用途 / 描述 / 获取途径直接摊开——
 * 图标视图里它们只在悬停提示里，触屏上看不到，按描述搜到的也看不出命中在哪。
 * 结果区窄（.il--compact）时一行折成一张卡片。
 * 用途 / 描述 / 获取途径是模板输出的 wikitext 解析结果（带站内链接），原样放回。
 */
const { pageList } = storeToRefs(useItemListStore());
</script>

<template>
  <table class="ak-table il-table">
    <thead>
      <tr>
        <th scope="col"><span class="ak-sr-only">图标</span></th>
        <th scope="col">道具</th>
        <th scope="col">用途 / 描述</th>
        <th scope="col">获取途径</th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="item in pageList" :key="item.index">
        <td class="il-c-icon">
          <a :href="item.href" tabindex="-1" aria-hidden="true">
            <ItemIcon :item="item" />
          </a>
        </td>
        <th scope="row" class="il-c-name">
          <a class="il-name" :href="item.href">{{ item.name }}</a>
          <span v-if="item.categories.length > 0" class="ak-tags">
            <span
              v-for="category in item.categories"
              :key="category"
              class="ak-tag ak-tag--sm ak-tag--outline"
            >
              {{ category }}
            </span>
          </span>
        </th>
        <td
          :class="[
            'il-c-text',
            { 'is-blank': !item.usage && !item.description },
          ]"
        >
          <p v-if="item.usage" class="il-usage" v-html="item.usageHtml" />
          <p
            v-if="item.description"
            class="il-desc"
            v-html="item.descriptionHtml"
          />
        </td>
        <td
          :class="['il-c-obtain', { 'is-blank': !item.obtainHtml }]"
          v-html="item.obtainHtml"
        />
      </tr>
    </tbody>
  </table>
</template>

<style scoped lang="scss">
.il-table {
  table-layout: fixed;
  font-size: var(--ak-fs-sm);

  thead th {
    padding: 9px 12px;
    white-space: nowrap;
    letter-spacing: 0;
    text-transform: none;

    &:nth-child(1) {
      width: 56px;
    }

    &:nth-child(2) {
      width: 22%;
    }

    &:nth-child(4) {
      width: 22%;
    }
  }

  td,
  tbody th {
    padding: 10px 12px;
    vertical-align: top;
    line-height: 1.55;
    overflow-wrap: anywhere;
  }

  td.il-c-icon {
    padding-right: 0;

    > a {
      display: block;
      width: 56px;
    }
  }

  tbody th.il-c-name {
    font-weight: 400;
    text-align: left;

    .ak-tags {
      gap: 4px;
      margin-top: 6px;
    }
  }

  p {
    margin: 0;
  }

  // 根节点是 ak-not-prose，链接默认继承文字色：模板原文里的站内链接照正文链接上色
  :is(.il-c-text, .il-c-obtain) :deep(a) {
    color: var(--ak-link);

    &:hover {
      color: var(--ak-link-hover);
    }
  }
}

.il-name {
  font-weight: 700;
  font-size: var(--ak-fs-body);
  line-height: 1.3;
  color: var(--ak-fg);
  text-decoration: none;

  &:visited {
    color: var(--ak-fg);
  }

  &:hover {
    color: var(--ak-accent);
    text-decoration: underline;
  }

  &:focus-visible {
    outline: 2px solid var(--ak-focus);
    outline-offset: 2px;
  }
}

.il-usage {
  color: var(--ak-fg);
}

// 描述是游戏里的风味文字，比用途弱一级
.il-desc {
  font-size: var(--ak-fs-xs);
  line-height: 1.6;
  color: var(--ak-fg-muted);

  .il-usage + & {
    margin-top: 4px;
  }
}

.il-c-obtain {
  font-size: var(--ak-fs-xs);
  color: var(--ak-fg-secondary);
}

// 结果区窄：一行折成一张卡片——图标 + 名字一排，下面依次是用途 / 描述、获取途径
.il--compact .il-table {
  display: block;
  border: 0;
  background: none;

  thead {
    display: none;
  }

  tbody {
    display: grid;
    gap: var(--ak-space-2);
  }

  tr {
    display: grid;
    grid-template-columns: 56px minmax(0, 1fr);
    gap: 8px 12px;
    padding: var(--ak-space-3);
    background: var(--ak-bg-surface);
    border: 1px solid var(--ak-border);
  }

  td,
  tbody th {
    display: block;
    padding: 0;
    border: 0;
  }

  tbody tr:hover :is(td, th) {
    background: none;
  }

  .il-c-name {
    align-self: center;
  }

  .il-c-text,
  .il-c-obtain {
    grid-column: 1 / -1;

    &.is-blank {
      display: none;
    }
  }

  .il-c-obtain::before {
    content: "获取途径";
    margin-right: 8px;
    font-weight: 600;
    color: var(--ak-fg-muted);
  }
}
</style>
