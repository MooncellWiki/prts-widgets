<script setup lang="ts" generic="T extends { key: string; text: string }">
import { computed } from "vue";

import {
  AkButton,
  AkSelect,
  AkTag,
  useToast,
} from "@mooncellwiki/prts-design-vue";

import ListPager from "./ListPager.vue";

/**
 * 一览页（干员 / 敌人 / 道具一览）的结果栏：条数 · 已选条件 · 复制链接 · 每页条数 · 分页。
 * 已选条件在这里再列一遍（可逐个移除）：筛选面板滚出视口后，仍看得到当前结果是怎么筛出来的。
 * 条数后面要补说明的（干员一览的 ⓘ）放 #help。
 */
const props = withDefaults(
  defineProps<{
    /** 筛出来的条数 */
    shown: number;
    total: number;
    /** 条数后面的量词 + 名称：「件道具」 */
    unit: string;
    /** 已选条件，一项一枚可移除的标签；搜索词另由 v-model:q 给 */
    tags: T[];
    step: number;
    steps: readonly number[];
    page: number;
    pageCount: number;
    /** 要复制的链接，点「复制链接」时才取 */
    link: () => string;
    copyLabel?: string;
    /** 窄排布：工具（复制链接 · 每页条数 · 分页）另起一行、铺满 */
    narrow?: boolean;
  }>(),
  { copyLabel: "复制链接" },
);
defineEmits<{
  remove: [tag: T];
  clear: [];
  "update:step": [step: number];
  "update:page": [page: number];
}>();
const q = defineModel<string>("q", { required: true });

const toast = useToast();

const stepOptions = computed(() =>
  props.steps.map((n) => ({ label: `每页 ${n}`, value: n })),
);
const activeCount = computed(() => props.tags.length + (q.value ? 1 : 0));

async function copyLink() {
  const url = props.link();
  try {
    await navigator.clipboard.writeText(url);
    toast.success(decodeURIComponent(url), { title: "链接已复制" });
  } catch {
    toast.error(decodeURIComponent(url), { title: "复制失败，请手动复制" });
  }
}
</script>

<template>
  <div :class="['ls-bar', { 'ls-bar--narrow': narrow }]">
    <div class="ls-bar__num">
      <span class="ls-bar__count" role="status">
        <template v-if="shown === total">
          共 <b>{{ total }}</b> {{ unit }}
        </template>
        <template v-else>
          <b>{{ shown }}</b> / {{ total }} {{ unit }}
        </template>
      </span>
      <slot name="help" />
    </div>
    <div class="ls-bar__active ak-tags">
      <AkTag v-if="q" removable @remove="q = ''">搜索：{{ q }}</AkTag>
      <AkTag
        v-for="tag in tags"
        :key="tag.key"
        removable
        @remove="$emit('remove', tag)"
      >
        {{ tag.text }}
      </AkTag>
      <AkButton
        v-if="activeCount > 1"
        variant="link"
        size="xs"
        @click="$emit('clear')"
      >
        清除全部
      </AkButton>
    </div>
    <div class="ls-bar__tools">
      <AkButton variant="ghost" size="sm" icon="link" @click="copyLink">
        {{ copyLabel }}
      </AkButton>
      <AkSelect
        :model-value="step"
        :options="stepOptions"
        label="每页条数"
        @update:model-value="$emit('update:step', Number($event))"
      />
      <ListPager
        :page="page"
        :page-count="pageCount"
        label="分页"
        :narrow="narrow"
        @update:page="$emit('update:page', $event)"
      />
    </div>
  </div>
</template>

<style scoped lang="scss">
.ls-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
  margin: 0 0 var(--ak-space-3);
  min-height: 32px;

  &__num {
    flex: none;
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }

  &__count {
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
      outline: 2px solid var(--ak-focus);
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
  }

  &--narrow &__tools {
    margin-left: 0;
    width: 100%;
    justify-content: space-between;
  }

  :deep(.ak-icon) {
    width: 14px;
    height: 14px;
  }
}
</style>
