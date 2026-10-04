<script setup lang="ts">
import { AkIcon, AkPagination } from "@mooncellwiki/prts-design-vue";

import { useEnemyList } from "./store";

/** 分页条，结果上下各一条；只有一页时不出 */
defineProps<{ label: string }>();
const emit = defineEmits<{ change: [] }>();

const store = useEnemyList();
const { page, pageCount } = store;

function go(n: number) {
  store.setPage(n);
  emit("change");
}
</script>

<template>
  <AkPagination
    v-if="pageCount > 1"
    class="el-pager"
    :model-value="page"
    :page-count="pageCount"
    :label="label"
    @update:model-value="go"
  >
    <template #prev><AkIcon name="chevron-left" /></template>
    <template #next><AkIcon name="chevron-right" /></template>
  </AkPagination>
</template>

<style scoped lang="scss">
.el-pager {
  :deep(.ak-icon) {
    width: 14px;
    height: 14px;
  }

  // 窄排布：分页条铺满一行、页码格等分——左右缘与上面的控件、下面的结果对齐（按内容宽居中会短一截）
  .el--narrow & {
    display: flex;
    flex: 1 0 100%;

    > :deep(*) {
      flex: 1 1 0;
      min-width: 0;
      text-align: center;
    }

    :deep(.ak-pagination__item) {
      min-width: 26px;
      padding: 0 6px;
    }
  }
}
</style>
