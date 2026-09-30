<script setup lang="ts">
import { AkIcon, AkPagination } from "@mooncellwiki/prts-design-vue";
import { storeToRefs } from "pinia";

import { useCharListStore } from "./store";

/** 分页条，结果上下各一条；只有一页时不出 */
defineProps<{ label: string }>();
const emit = defineEmits<{ change: [] }>();

const store = useCharListStore();
const { page, pageCount } = storeToRefs(store);

function go(n: number) {
  store.setPage(n);
  emit("change");
}
</script>

<template>
  <AkPagination
    v-if="pageCount > 1"
    class="ol-pager"
    :model-value="page"
    :page-count="pageCount"
    :label="label"
    @update:model-value="go"
  >
    <template #prev><AkIcon name="chevron-left" /></template>
    <template #next><AkIcon name="chevron-right" /></template>
  </AkPagination>
</template>
