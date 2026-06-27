<script setup lang="ts">
import { computed, ref, watch } from "vue";

import {
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
import {
  categoryAliases,
  defaultFilterConfig,
  obtainApproachAliases,
  rarityLabelMap,
  sortOptions,
} from "./consts";

import type { ItemData } from "./types";

const props = defineProps<{
  items: ItemData[];
}>();

const keyword = ref("");
const i18nConfig = getNaiveUILocale();
const isMobile = isMobileSkin();
const { theme, isDark } = useTheme();

const filterConfig = ref(defaultFilterConfig);

const pagination = ref({
  page: 1,
  pageSize: 50,
  pageSizes: [50, 100, 200, 500],
  pageSlot: isMobile ? 5 : 9,
  showSizePicker: true,
  onChange: (page: number) => {
    pagination.value.page = page;
  },
  onUpdatePageSize: (pageSize: number) => {
    pagination.value.pageSize = pageSize;
    pagination.value.page = 1;
  },
});

const filteredItemData = computed(() => {
  const { states, sortOrder } = filterConfig.value;
  const searchWord = keyword.value.toLowerCase();

  let result = props.items.filter((item) => {
    if (
      states.rarity.length > 0 &&
      !states.rarity.some((r) => rarityLabelMap[r] === item.rarity)
    ) {
      return false;
    }

    if (states.category.length > 0) {
      const hasMatch = states.category.some((category) => {
        const aliases = categoryAliases[category];
        if (aliases) {
          return aliases.some((alias) => item.categories.includes(alias));
        }
        return states.category.some((c) => item.categories.includes(c));
      });
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

    if (
      searchWord &&
      !item.name.toLowerCase().includes(searchWord) &&
      !item.description.toLowerCase().includes(searchWord)
    ) {
      return false;
    }

    return true;
  });

  result = [...result].sort((a, b) => {
    switch (sortOrder) {
      case "id_asc": {
        return a.sortId - b.sortId;
      }
      case "id_desc": {
        return b.sortId - a.sortId;
      }
      case "rarity_asc": {
        return a.rarity === b.rarity
          ? a.sortId - b.sortId
          : a.rarity - b.rarity;
      }
      case "rarity_desc": {
        return a.rarity === b.rarity
          ? a.sortId - b.sortId
          : b.rarity - a.rarity;
      }
      default: {
        return 0;
      }
    }
  });

  return result;
});

const paginatedItemData = computed(() =>
  filteredItemData.value.slice(
    pagination.value.pageSize * (pagination.value.page - 1),
    pagination.value.pageSize * pagination.value.page,
  ),
);

watch(
  () => [
    filterConfig.value.states,
    filterConfig.value.sortOrder,
    keyword.value,
  ],
  () => {
    pagination.value.page = 1;
  },
  { deep: true },
);
</script>

<template>
  <NConfigProvider
    preflight-style-disabled
    :theme="theme"
    :locale="i18nConfig.locale"
    :date-locale="i18nConfig.dateLocale"
  >
    <NLayout :class="['mx-auto p-2 antialiased', isDark && 'prts-widget-dark']">
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
        <div class="w-5em">
          <span class="mdi mdi-package-variant-closed"></span>
          {{ filteredItemData.length }}
        </div>
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
      </div>
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
    </NLayout>
  </NConfigProvider>
</template>

<style scoped>
@import "@/styles/dark-mode.scss";
:global(.page-道具一览 .backToTop) {
  @apply hidden!;
}

:deep(.n-pagination) {
  @apply justify-center!;
}
</style>
