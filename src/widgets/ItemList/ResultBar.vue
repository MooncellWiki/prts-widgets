<script setup lang="ts">
import { computed } from "vue";

import { storeToRefs } from "pinia";

import ListResultBar from "@/components/list/ListResultBar.vue";

import { PAGE_STEPS } from "./consts";
import { FILTER_IDS, FILTERS } from "./filters";
import { useItemListStore } from "./store";

/** 结果栏：条数 · 已选条件 · 复制链接 · 每页条数 · 分页 */
defineProps<{ narrow: boolean }>();

const store = useItemListStore();
const { state } = store;
const { list, items, page, pageCount } = storeToRefs(store);

const active = computed(() =>
  FILTER_IDS.flatMap((id) =>
    FILTERS[id].options
      .filter((option) => state.selection[id].has(option.id))
      .map((option) => ({
        key: `${id}:${option.id}`,
        id,
        option: option.id,
        text: `${FILTERS[id].title}：${option.label}`,
      })),
  ),
);

const link = () => location.href;
</script>

<template>
  <ListResultBar
    v-model:q="state.q"
    :shown="list.length"
    :total="items.length"
    unit="件道具"
    :tags="active"
    :step="state.step"
    :steps="PAGE_STEPS"
    :page="page"
    :page-count="pageCount"
    :link="link"
    :narrow="narrow"
    @remove="store.toggle($event.id, $event.option)"
    @clear="store.reset()"
    @update:step="store.setStep"
    @update:page="store.setPage"
  />
</template>
