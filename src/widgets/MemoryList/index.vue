<script setup lang="ts">
import { computed, reactive, ref, useTemplateRef, watch } from "vue";

import { AkScope } from "@mooncellwiki/prts-design-vue";
import { useQuery } from "@pinia/colada";
import { useElementSize } from "@vueuse/core";
import { debounce } from "lodash-es";
import { NConfigProvider, NEmpty, NLayout } from "naive-ui";

import { getNaiveUILocale } from "@/utils/i18n";
import { useTheme } from "@/utils/theme";
import { useHostTheme } from "@/utils/useHostTheme";

import Memory from "./Memory.vue";
import PagerBar from "./PagerBar.vue";
import Toolbar from "./Toolbar.vue";
import { filterRarity, rarityMap } from "./consts";
import FilterPanel from "./filter/FilterPanel.vue";
import { memoryQuery } from "./utils";

import type { CharMemory } from "./types";

const i18nConfig = getNaiveUILocale();
const { theme, themeOverrides, isDark } = useTheme();
const scopeTheme = useHostTheme();
const states = ref<string[]>([]);
const sorting = ref("lmmr");
const order = ref(-1);
const searchTerm = ref("");
const { data } = useQuery(memoryQuery);
const charMemoryData = computed(() => data.value ?? []);
const isLoaded = computed(() => !!data.value);

/* 排布看内容区自己的宽度，不看视口：窄了分页条另起一行、卡片文字收小 */
const root = useTemplateRef<HTMLElement>("root");
// 挂载前（含外壳预渲染）是 +∞：先按最宽的排布出
const { width } = useElementSize(
  root,
  { width: Number.POSITIVE_INFINITY, height: 0 },
  { box: "border-box" },
);
const narrow = computed(() => width.value < 640);

const compareDate = (mmrx: CharMemory, mmry: CharMemory) => {
  const [datex, datey] = [mmrx, mmry].map((mmr) => {
    return sorting.value === "opt"
      ? new Date(1)
      : mmr.memories.slice().sort((ma, mb) => {
          return sorting.value === "lmmr"
            ? mb.time.getTime() - ma.time.getTime()
            : ma.time.getTime() - mb.time.getTime();
        })[0].time;
  });
  const result =
    datex.getTime() === datey.getTime()
      ? Number(mmrx.charID) - Number(mmry.charID)
      : datex.getTime() - datey.getTime();
  return order.value ? result * order.value : -result;
};
const filteredMemory = ref<CharMemory[]>([]);

function _calcMemory() {
  if (states.value.length === 0 && searchTerm.value === "") {
    filteredMemory.value = charMemoryData.value.toSorted(compareDate);
  }

  const rarity = states.value;
  const keyword = searchTerm.value;
  filteredMemory.value = charMemoryData.value
    .filter((charm) => {
      if (rarity.length > 0 && !rarity.includes(rarityMap[charm.rarity]))
        return false;

      return (
        charm.char.includes(keyword) ||
        charm.memories.some(
          (memory) =>
            memory.name.includes(keyword) ||
            memory.info.some((info) => info.intro.includes(keyword)),
        )
      );
    })
    .sort(compareDate);
  pagination.page = 1;
}
const calcMemory = debounce(_calcMemory, 300);

const pagination = reactive({
  page: 1,
  pageSize: 10,
  pageSizes: [10, 25, 50, 100],
});
function onUpdatePageSize(pageSize: number) {
  pagination.pageSize = pageSize;
  pagination.page = 1;
  calcMemory();
}
const shownMemory = computed(() => {
  return filteredMemory.value.slice(
    pagination.pageSize * (pagination.page - 1),
    pagination.pageSize * pagination.page,
  );
});
const pageCount = computed(() =>
  Math.max(1, Math.ceil(filteredMemory.value.length / pagination.pageSize)),
);

/** 搜索词由 AkSearch 给，可能带 undefined（清空输入时） */
function onSearchInput(value: string) {
  searchTerm.value = value;
  calcMemory();
}

function onSort(value: string) {
  sorting.value = value;
  calcMemory();
}

function onOrder(value: number) {
  order.value = value;
  calcMemory();
}

// 取到数据后先按默认排序列一遍；缓存里已经有数据（或外壳预渲染）时也要先算一次
watch(data, () => _calcMemory(), { immediate: true });
</script>

<template>
  <AkScope class="memory-list ak-not-prose" :theme="scopeTheme" data-no-toggle>
    <NConfigProvider
      preflight-style-disabled
      inline-theme-disabled
      :theme="theme"
      :theme-overrides="themeOverrides"
      :locale="i18nConfig.locale"
      :date-locale="i18nConfig.dateLocale"
    >
      <NLayout
        :class="[
          'mx-auto max-w-3xl p-2 antialiased lg:max-w-[90rem] md:p-4',
          isDark && 'prts-widget-dark',
        ]"
      >
        <div ref="root" class="ml-root">
          <FilterPanel
            v-model="states"
            :title="filterRarity.title"
            :options="filterRarity.options"
            @update:model-value="calcMemory"
          />

          <Toolbar
            :q="searchTerm"
            :sorting="sorting"
            :order="order"
            :disabled="!isLoaded"
            @update:q="onSearchInput"
            @update:sorting="onSort"
            @update:order="onOrder"
          />

          <PagerBar
            :page="pagination.page"
            :page-count="pageCount"
            :page-size="pagination.pageSize"
            :page-sizes="pagination.pageSizes"
            label="分页（顶部）"
            :narrow="narrow"
            @update:page="pagination.page = $event"
            @update:page-size="onUpdatePageSize"
          />

          <div class="ml-result">
            <Memory
              v-for="charm in shownMemory"
              :key="charm.char"
              :char-memory="charm"
              :narrow="narrow"
            >
            </Memory>
          </div>

          <NEmpty v-if="shownMemory.length === 0" description="无结果">
            <template #icon>
              <span class="mdi mdi-book-search text-5xl" />
            </template>
          </NEmpty>

          <PagerBar
            :page="pagination.page"
            :page-count="pageCount"
            :page-size="pagination.pageSize"
            :page-sizes="pagination.pageSizes"
            label="分页（底部）"
            :narrow="narrow"
            @update:page="pagination.page = $event"
            @update:page-size="onUpdatePageSize"
          />
        </div>
      </NLayout>
    </NConfigProvider>
  </AkScope>
</template>

<style scoped>
@import "@/styles/dark-mode.scss";
</style>

<style scoped lang="scss">
// 别的皮肤上根节点带 data-theme（见 useHostTheme），设计系统会连画布底色一起铺；这里嵌在宿主正文里，不要那块底
.memory-list.ak-scope[data-theme] {
  background-color: transparent;
}

.ml-root {
  min-width: 0;
}

// 结果区排布同改版前：窄的一列，≥1024 两列（Memory.vue 自己也是 AkScope，卡片宽度写在那边）
.ml-result {
  display: flex;
  flex-direction: column;
  flex-wrap: wrap;
  width: 100%;
}

@media (min-width: 1024px) {
  .ml-result {
    flex-direction: row;
  }
}
</style>
