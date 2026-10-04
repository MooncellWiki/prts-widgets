<script setup lang="ts">
import { computed } from "vue";

import { AkChip } from "@mooncellwiki/prts-design-vue";

import { useEnemyList } from "../store";

import type { FilterState } from "../filter";

/** 一行筛选的选项芯片；地位行的精英 / 领袖前面带色块（同结果里的色条） */
const props = defineProps<{ filter: FilterState }>();

const store = useEnemyList();

const RANK: Record<string, string> = { 精英: "elite", 领袖: "boss" };

const empty = computed(() => store.empties.value.get(props.filter.id));
</script>

<template>
  <AkChip
    v-for="option in filter.def.options"
    :key="option.id"
    :model-value="filter.selected.has(option.id)"
    :class="{ 'is-empty': empty?.has(option.id) }"
    :data-tip="option.tip"
    @update:model-value="store.toggle(filter, option.id)"
  >
    <i
      v-if="filter.id === 'enemyLevel' && RANK[option.id]"
      class="el-rank"
      :data-rank="RANK[option.id]"
      aria-hidden="true"
    />{{ option.id }}
  </AkChip>
</template>

<style scoped lang="scss">
@use "../mixins";

.ak-chip {
  // 再点一下会筛出 0 条的选项压淡，仍可点
  &.is-empty:not([aria-pressed="true"]) {
    opacity: 0.38;
  }

  &:focus-visible {
    @include mixins.focus-ring;
  }
}

.el-rank {
  @include mixins.rank-color;

  width: 7px;
  height: 7px;
  background: var(--_rank);
}
</style>
