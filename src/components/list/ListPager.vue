<script setup lang="ts">
import { AkIcon, AkPagination } from "@mooncellwiki/prts-design-vue";

/** 一览页（干员 / 敌人 / 道具一览）的分页条，结果上下各一条；只有一页时不出 */
defineProps<{
  page: number;
  pageCount: number;
  label: string;
  /** 窄排布：独占一行，页码格居中 */
  narrow?: boolean;
}>();
defineEmits<{ "update:page": [page: number] }>();
</script>

<template>
  <AkPagination
    v-if="pageCount > 1"
    :class="['ls-pager', { 'ls-pager--narrow': narrow }]"
    :model-value="page"
    :page-count="pageCount"
    :label="label"
    @update:model-value="$emit('update:page', $event)"
  >
    <template #prev><AkIcon name="chevron-left" /></template>
    <template #next><AkIcon name="chevron-right" /></template>
  </AkPagination>
</template>

<style scoped lang="scss">
.ls-pager {
  :deep(.ak-icon) {
    width: 14px;
    height: 14px;
  }

  // 窄排布：分页条独占一行，页码格居中、大小同桌面（不平分整行）
  &--narrow {
    display: flex;
    flex: 1 0 100%;
    justify-content: center;

    // 设计系统的页码格是 content-box、靠 min-width: 32px 撑宽，收不动：换成 flex-basis，一行放不下时才收窄，不超框
    :deep(.ak-pagination__item) {
      flex: 0 1 32px;
      min-width: 0;
    }
  }
}
</style>
