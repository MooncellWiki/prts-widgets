<script setup lang="ts">
import { computed } from "vue";

import { AkButton, AkPopover } from "@mooncellwiki/prts-design-vue";
import { storeToRefs } from "pinia";

import ListResultBar from "@/components/list/ListResultBar.vue";

import { wikiLink } from "./assets";
import { PAGE_STEPS } from "./consts";
import { filterTitle, selectedOptions } from "./filter";
import { useCharListStore } from "./store";

/**
 * 结果栏：条数 · 已选条件 · 复制短链接 · 每页条数 · 分页。
 * 条数后面的 ⓘ 说明这个数是怎么来的（点开的弹出卡片，里面有链接，所以不用悬停提示）。
 */
defineProps<{ narrow: boolean }>();

const store = useCharListStore();
const { state } = store;
const { list, filters, chars, page, pageCount } = storeToRefs(store);

const active = computed(() =>
  filters.value.flatMap((f) =>
    selectedOptions(f).map(({ id, label }) => ({
      key: `${f.id}:${id}`,
      filter: f,
      id,
      // 势力行切到作战模式时，行名写成「作战势力」
      text: `${filterTitle(f)}${f.selection.and ? "（同时）" : ""}：${label}`,
    })),
  ),
);

// CHAR 是站内给干员一览留的短链接入口
const link = () => `${location.origin}/w/CHAR${location.hash}`;
</script>

<template>
  <ListResultBar
    v-model:q="state.q"
    :shown="list.length"
    :total="chars.length"
    unit="位干员"
    :tags="active"
    :step="state.step"
    :steps="PAGE_STEPS"
    :page="page"
    :page-count="pageCount"
    :link="link"
    copy-label="复制短链接"
    :narrow="narrow"
    @remove="store.toggle($event.filter, $event.id)"
    @clear="store.reset()"
    @update:step="store.setStep"
    @update:page="store.setPage"
  >
    <template #help>
      <AkPopover title="关于干员计数" placement="bottom-start">
        <template #trigger>
          <AkButton
            variant="ghost"
            size="xs"
            icon="info"
            label="关于干员计数"
          />
        </template>
        <p class="ol-help">
          本站的干员计数记录的是<b>所有单个个体干员</b>的数量，也即<a
            class="ol-link"
            :href="wikiLink('阿米娅')"
            >阿米娅</a
          >的不同升变将分别计 1 名干员。
        </p>
      </AkPopover>
    </template>
  </ListResultBar>
</template>

<style scoped lang="scss">
.ol-help {
  margin: 0;
}

// 根节点是 ak-not-prose，链接默认继承文字色：照正文链接自己上色
.ol-link {
  color: var(--ak-link);

  &:hover {
    color: var(--ak-link-hover);
  }
}
</style>
