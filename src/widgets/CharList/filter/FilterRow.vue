<script setup lang="ts">
import { useId } from "vue";

import { AkSwitch } from "@mooncellwiki/prts-design-vue";

import { useCharListStore } from "../store";

import FilterChips from "./FilterChips.vue";

import type { FilterState } from "../filter";

/**
 * 一行筛选 = 标签列 + 选项芯片。选中后标签左缘出青条、露出「清除」；
 * 不设「全选」（全选与不选筛出的是同一批）；「同时满足」只有词缀行有。
 */
defineProps<{
  filter: FilterState;
  find?: string;
}>();

defineSlots<{
  /** 选项后面并排的内容（职业行的提示、稀有度行里的「位置」） */
  default?: () => unknown;
}>();

const store = useCharListStore();
const id = useId();
</script>

<template>
  <div
    :class="['ol-row', { 'has-active': filter.sel.size > 0 }]"
    role="group"
    :aria-labelledby="id"
  >
    <div class="ol-row__label">
      <span :id="id">{{ filter.title }}</span>
      <AkSwitch
        v-if="filter.canAnd"
        :model-value="filter.and"
        size="sm"
        @update:model-value="store.setAnd(filter, $event)"
      >
        同时满足
      </AkSwitch>
      <button
        type="button"
        class="ol-row__clear"
        :aria-label="`清除「${filter.title}」的选择`"
        @click="store.clear(filter)"
      >
        清除
      </button>
    </div>
    <div class="ol-row__opts">
      <FilterChips :filter="filter" :find="find" />
      <slot />
    </div>
  </div>
</template>
