<script setup lang="ts">
import { computed } from "vue";

import {
  AkButton,
  AkSelect,
  AkTag,
  useToast,
} from "@mooncellwiki/prts-design-vue";

import Pager from "./Pager.vue";
import { PAGE_STEPS } from "./consts";
import { selectedOptions } from "./filter";
import { useEnemyList } from "./store";

/**
 * 结果栏：条数 · 已选条件 · 复制链接 · 每页条数 · 分页。
 * 已选条件在这里再列一遍（可逐个移除）：筛选面板滚出视口后，仍看得到当前结果是怎么筛出来的。
 */
const store = useEnemyList();
const { enemies, state, filters, list, hash } = store;
const toast = useToast();

const STEP_OPTIONS = PAGE_STEPS.map((n) => ({ label: `每页 ${n}`, value: n }));

const active = computed(() =>
  filters.flatMap((f) =>
    selectedOptions(f).map(({ id }) => ({
      filter: f,
      id,
      text: `${f.def.title}：${id}`,
    })),
  ),
);
const activeCount = computed(() => active.value.length + (state.q ? 1 : 0));

/** 当前的筛选 / 搜索 / 排序 / 显示方式写成 # 参数；地址栏本身不动（见 hash.ts） */
async function copyLink() {
  const url = `${location.origin}${location.pathname}${location.search}${
    hash.value ? `#${hash.value}` : ""
  }`;
  try {
    await navigator.clipboard.writeText(url);
    toast.success(decodeURIComponent(url), { title: "链接已复制" });
  } catch {
    toast.error(decodeURIComponent(url), { title: "复制失败，请手动复制" });
  }
}
</script>

<template>
  <div class="el-bar">
    <span class="el-bar__count" role="status">
      <template v-if="list.length === enemies.length">
        共 <b>{{ enemies.length }}</b> 个敌人
      </template>
      <template v-else>
        <b>{{ list.length }}</b> / {{ enemies.length }} 个敌人
      </template>
    </span>
    <div class="el-bar__active ak-tags">
      <AkTag v-if="state.q" removable @remove="state.q = ''">
        搜索：{{ state.q }}
      </AkTag>
      <AkTag
        v-for="item in active"
        :key="`${item.filter.id}:${item.id}`"
        removable
        @remove="store.toggle(item.filter, item.id)"
      >
        {{ item.text }}
      </AkTag>
      <AkButton
        v-if="activeCount > 1"
        variant="link"
        size="xs"
        @click="store.reset()"
      >
        清除全部
      </AkButton>
    </div>
    <div class="el-bar__tools">
      <AkButton variant="ghost" size="sm" icon="link" @click="copyLink">
        复制链接
      </AkButton>
      <AkSelect
        :model-value="state.step"
        :options="STEP_OPTIONS"
        label="每页条数"
        @update:model-value="store.setStep(Number($event))"
      />
      <Pager label="分页" />
    </div>
  </div>
</template>

<style scoped lang="scss">
@use "./mixins";

.el-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
  margin: 0 0 var(--ak-space-3);
  min-height: 32px;

  &__count {
    flex: none;
    font-size: var(--ak-fs-sm);
    color: var(--ak-fg-muted);
    white-space: nowrap;

    b {
      font: 700 var(--ak-fs-h3) / 1 var(--ak-font-label);
      color: var(--ak-fg);
      font-variant-numeric: tabular-nums;
      margin-right: 2px;
    }
  }

  &__active {
    flex: 1 1 200px;
    min-width: 0;
    align-items: center;

    .ak-tag {
      height: 24px;
    }

    :deep(.ak-tag__remove:focus-visible) {
      @include mixins.focus-ring(0);
    }
  }

  &__tools {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    margin-left: auto;

    .ak-select {
      width: auto;
      min-height: 32px;
      font-size: var(--ak-fs-xs);
    }

    .el--narrow & {
      margin-left: 0;
      width: 100%;
      justify-content: space-between;
    }
  }

  :deep(.ak-icon) {
    width: 14px;
    height: 14px;
  }
}
</style>
