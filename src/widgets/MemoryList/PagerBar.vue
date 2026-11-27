<script setup lang="ts">
import { computed } from "vue";

import { AkSelect, type SelectValue } from "@mooncellwiki/prts-design-vue";

import ListPager from "@/components/list/ListPager.vue";

/** 分页条：每页条数 + 页码；结果上下各一条，只有一页时 AkPagination 自己不出 */
const props = withDefaults(
  defineProps<{
    page: number;
    pageCount: number;
    pageSize: number;
    pageSizes: number[];
    label: string;
    /** 窄排布：每页条数与页码另起一行、居中 */
    narrow?: boolean;
  }>(),
  { narrow: false },
);
const emit = defineEmits<{
  "update:page": [page: number];
  "update:pageSize": [size: number];
}>();

const sizeOptions = computed(() =>
  props.pageSizes.map((size) => ({ label: `每页 ${size}`, value: size })),
);

function onSize(value: SelectValue | null | undefined) {
  if (value == null) return;
  const size = Number(value);
  if (Number.isFinite(size)) emit("update:pageSize", size);
}
</script>

<template>
  <div :class="['ml-pager', { 'ml-pager--narrow': narrow }]">
    <AkSelect
      class="ml-pager__size"
      :model-value="pageSize"
      :options="sizeOptions"
      label="每页条数"
      @update:model-value="onSize"
    />
    <ListPager
      :page="page"
      :page-count="pageCount"
      :label="label"
      :narrow="narrow"
      @update:page="emit('update:page', $event)"
    />
  </div>
</template>

<style scoped lang="scss">
.ml-pager {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin: 0 0 var(--ak-space-3);

  &--narrow {
    align-items: stretch;
  }

  &__size {
    width: auto;
    min-height: 32px;
    font-size: var(--ak-fs-xs);
  }
}
</style>
