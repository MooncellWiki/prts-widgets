<script setup lang="ts">
import { computed } from "vue";

import ListResultBar from "@/components/list/ListResultBar.vue";

import { PAGE_STEPS } from "./consts";
import { selectedOptions } from "./filter";
import { useEnemyList } from "./store";

/** 结果栏：条数 · 已选条件 · 复制链接 · 每页条数 · 分页 */
defineProps<{ narrow: boolean }>();

const store = useEnemyList();
const { enemies, state, filters, list, hash, page, pageCount } = store;

const active = computed(() =>
  filters.flatMap((f) =>
    selectedOptions(f).map(({ id }) => ({
      key: `${f.id}:${id}`,
      filter: f,
      id,
      text: `${f.def.title}：${id}`,
    })),
  ),
);

/** 当前的筛选 / 搜索 / 排序 / 显示方式写成 # 参数；地址栏本身不动（见 hash.ts） */
const link = () =>
  `${location.origin}${location.pathname}${location.search}${
    hash.value ? `#${hash.value}` : ""
  }`;
</script>

<template>
  <ListResultBar
    v-model:q="state.q"
    :shown="list.length"
    :total="enemies.length"
    unit="个敌人"
    :tags="active"
    :step="state.step"
    :steps="PAGE_STEPS"
    :page="page"
    :page-count="pageCount"
    :link="link"
    :narrow="narrow"
    @remove="store.toggle($event.filter, $event.id)"
    @clear="store.reset()"
    @update:step="store.setStep"
    @update:page="store.setPage"
  />
</template>
