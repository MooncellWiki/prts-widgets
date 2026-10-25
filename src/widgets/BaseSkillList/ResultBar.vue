<script setup lang="ts">
import { computed } from "vue";

import { AkButton } from "@mooncellwiki/prts-design-vue";

import ListResultBar from "@/components/list/ListResultBar.vue";

import { PAGE_STEPS, View } from "./consts";
import { selectedOptions, type FilterState } from "./filter";
import { useBaseSkillList } from "./store";

/**
 * 结果栏：条数（只写当前视图的那一种）· 已选条件 · 全部展开 / 折叠（技能视图的设施分组）· 复制链接 ·
 * 每页条数 · 分页（这两样只有干员视图有）
 */
defineProps<{ narrow: boolean }>();

const store = useBaseSkillList();
const { state, rows, shown, total, page, pageCount, allOpen } = store;

const active = computed(() =>
  rows.flatMap((f: FilterState) =>
    selectedOptions(f).map((option) => ({
      key: `${f.id}:${option.id}`,
      filter: f,
      id: option.id,
      text: `${f.def.title}：${option.label}${f.id === "rarity" ? " 星" : ""}`,
    })),
  ),
);
</script>

<template>
  <ListResultBar
    v-model:q="state.q"
    :shown="shown"
    :total="total"
    :unit="state.view === View.OP ? '位干员' : '条技能'"
    :tags="active"
    :step="state.step"
    :steps="state.view === View.OP ? PAGE_STEPS : []"
    :page="page"
    :page-count="pageCount"
    :link="store.shareLink"
    :copy-label="store.room ? '复制一览链接' : '复制链接'"
    :narrow="narrow"
    @remove="store.toggle($event.filter, $event.id)"
    @clear="store.reset()"
    @update:step="store.setStep"
    @update:page="store.setPage"
  >
    <template v-if="store.grouped && state.view === View.SKILL" #tools>
      <AkButton
        v-if="shown > 0"
        variant="ghost"
        size="sm"
        @click="store.setAllOpen(!allOpen)"
      >
        {{ allOpen ? "全部折叠" : "全部展开" }}
      </AkButton>
    </template>
  </ListResultBar>
</template>
