<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";

import {
  NButton,
  NConfigProvider,
  NInput,
  NLayout,
  NPagination,
  NSelect,
} from "naive-ui";

import { getNaiveUILocale } from "@/utils/i18n";
import { useTheme } from "@/utils/theme";
import { isMobileSkin } from "@/utils/utils";

import FilterGroup from "./FilterGroup.vue";
import ItemCard from "./ItemCard.vue";
import { defaultFilterConfig, obtainApproachAliases, sortOptions } from "./consts";
import { fetchAllItems } from "./itemData";

import type { ItemData } from "./types";

const itemData = ref<ItemData[]>([]);
const keyword = ref("");
const isLoading = ref(true);
const i18nConfig = getNaiveUILocale();
const isMobile = isMobileSkin();
const { theme, toggleDark } = useTheme();

const filterConfig = reactive(defaultFilterConfig);

const pagination = reactive({
  page: 1,
  pageSize: 50,
  pageSizes: [50, 100, 200, 500],
  pageSlot: isMobile ? 5 : 9,
  showSizePicker: true,
  onChange: (page: number) => {
    pagination.page = page;
  },
  onUpdatePageSize: (pageSize: number) => {
    pagination.pageSize = pageSize;
    pagination.page = 1;
  },
});

const filteredItemData = computed(() => {
  const { states, sortOrder } = filterConfig;
  const searchWord = keyword.value.toLowerCase();

  let result = itemData.value.filter((item) => {
    if (states.rarity.length > 0 && !states.rarity.includes(String(item.rarity))) {
      return false;
    }

    if (states.category.length > 0) {
      const hasMatch = states.category.some((c) => item.categories.includes(c));
      if (!hasMatch) return false;
    }

    if (states.obtainApproach.length > 0) {
      const hasMatch = states.obtainApproach.some((approach) => {
        const aliases = obtainApproachAliases[approach];
        if (aliases) {
          return aliases.some((alias) =>
            item.obtainApproach.some((oa) => oa.includes(alias)),
          );
        }
        return item.obtainApproach.some((oa) => oa.includes(approach));
      });
      if (!hasMatch) return false;
    }

    if (searchWord) {
      if (
        !item.name.toLowerCase().includes(searchWord) &&
        !item.description.toLowerCase().includes(searchWord)
      ) {
        return false;
      }
    }

    return true;
  });

  result = [...result].sort((a, b) => {
    switch (sortOrder) {
      case "id_asc":
        return a.sortId - b.sortId;
      case "id_desc":
        return b.sortId - a.sortId;
      case "rarity_asc":
        return a.rarity === b.rarity
          ? a.sortId - b.sortId
          : a.rarity - b.rarity;
      case "rarity_desc":
        return a.rarity === b.rarity
          ? a.sortId - b.sortId
          : b.rarity - a.rarity;
      default:
        return 0;
    }
  });

  return result;
});

const paginatedItemData = computed(() =>
  filteredItemData.value.slice(
    pagination.pageSize * (pagination.page - 1),
    pagination.pageSize * pagination.page,
  ),
);

onMounted(async () => {
  itemData.value = await fetchAllItems();
  isLoading.value = false;
});
</script>

<template>
  <NConfigProvider
    preflight-style-disabled
    :theme="theme"
    :locale="i18nConfig.locale"
    :date-locale="i18nConfig.dateLocale"
  >
    <NLayout class="mx-auto p-2 antialiased">
      <FilterGroup
        v-for="group in filterConfig.groups"
        :key="group.title"
        v-model:show="group.show"
        v-model:states="filterConfig.states"
        :title="group.title"
        :filters="
          Object.fromEntries(
            Object.entries(filterConfig.filters).filter(([key]) =>
              group.filters.includes(key),
            ),
          )
        "
      />
      <div class="my-2 flex items-center gap-2">
        <NInput
          v-model:value="keyword"
          type="text"
          placeholder="搜索道具名称/描述"
          clearable
        />
        <NSelect
          v-model:value="filterConfig.sortOrder"
          :options="sortOptions"
          style="width: 160px"
        />
        <div @click="toggleDark()">
          <NButton>
            <span v-if="theme" class="mdi mdi-brightness-6 text-2xl" />
            <span v-else class="mdi mdi-brightness-4 text-2xl" />
          </NButton>
        </div>
      </div>
      <div v-if="isLoading" class="py-8 text-center text-gray-400">
        加载中...
      </div>
      <template v-else>
        <div class="flex flex-wrap gap-1">
          <ItemCard
            v-for="item in paginatedItemData"
            :key="item.name"
            :item="item"
          />
        </div>
        <NPagination
          class="my-2 justify-center"
          :item-count="filteredItemData.length"
          :page="pagination.page"
          :page-size="pagination.pageSize"
          :page-sizes="pagination.pageSizes"
          :page-slot="pagination.pageSlot"
          :show-size-picker="pagination.showSizePicker"
          @update:page="pagination.onChange"
          @update:page-size="pagination.onUpdatePageSize"
        />
      </template>
    </NLayout>
  </NConfigProvider>
</template>

<style scoped>
:global(.page-道具一览 .backToTop) {
  @apply hidden!;
}

:deep(.n-pagination) {
  @apply justify-center!;
}
</style>
