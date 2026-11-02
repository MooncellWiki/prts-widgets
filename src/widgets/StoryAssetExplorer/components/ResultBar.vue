<script setup lang="ts">
import { computed } from "vue";

import { AkButton, AkSpinner } from "@mooncellwiki/prts-design-vue";

import ListResultBar from "@/components/list/ListResultBar.vue";

import { PAGE_STEPS, useExplorer } from "../store";
import { CHARACTER_CATEGORIES, resourceTypeUnit } from "../utils";

/** 结果栏：条数（索引还在取时带个转圈，没取完出错时给重试）· 已选条件 · 复制链接 · 每页条数 · 分页 */
defineProps<{ narrow: boolean }>();

const store = useExplorer();
const { state, indexes, list, total, page, pageCount } = store;

const index = computed(() => indexes[state.type]);

const tags = computed(() => {
  if (state.type !== "character" || !state.cat) return [];
  const label = CHARACTER_CATEGORIES.find(
    (option) => option.value === state.cat,
  )?.label;
  return [{ key: "cat", text: `分类：${label}` }];
});

const link = () => store.shareLink();
</script>

<template>
  <ListResultBar
    v-model:q="state.q"
    :shown="list.length"
    :total="total"
    :unit="resourceTypeUnit(state.type)"
    :tags="tags"
    :step="state.step"
    :steps="PAGE_STEPS[state.view]"
    :page="page"
    :page-count="pageCount"
    :link="link"
    :narrow="narrow"
    @remove="state.cat = ''"
    @clear="store.reset()"
    @update:step="store.setStep"
    @update:page="store.setPage"
  >
    <template #help>
      <span v-if="index.status === 'loading'" class="sae-loading" role="status">
        <AkSpinner variant="bars" label="正在载入" />
        载入中
      </span>
      <span
        v-else-if="index.status === 'error'"
        class="sae-loading"
        role="alert"
      >
        没载入完（{{ index.error }}）
        <AkButton variant="link" size="xs" @click="store.loadIndex(state.type)">
          重试
        </AkButton>
      </span>
    </template>
  </ListResultBar>
</template>

<style scoped lang="scss">
.sae-loading {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-left: 8px;
  font-size: var(--ak-fs-xs);
  color: var(--ak-fg-muted);
  white-space: nowrap;
}
</style>
