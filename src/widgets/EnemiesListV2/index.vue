<script setup lang="ts">
import { computed, h, nextTick, onMounted, reactive, ref, watch } from "vue";

import {
  NButton,
  NConfigProvider,
  NDataTable,
  NInput,
  NLayout,
  NPagination,
} from "naive-ui";

import { getNaiveUILocale } from "@/utils/i18n";
import { useTheme } from "@/utils/theme";
import { getImagePath, isMobileSkin } from "@/utils/utils";

import FilterGroup from "./FilterGroup.vue";
import { defaultFilterConfig } from "./consts";

import type { EnemyData, FilterConfig } from "./types";
import type {
  DataTableBaseColumn,
  DataTableColumn,
  DataTableColumns,
  DataTableFilterState,
  DataTableInst,
} from "naive-ui";

const enemyData = ref<EnemyData[]>([]);
const keyword = ref("");
const tableRef = ref<DataTableInst | null>(null);
const dimensionPrecedence = [
  "SS",
  "S+",
  "S",
  "A+",
  "A",
  "B+",
  "B",
  "C",
  "D",
  "E",
];
const filterConfig = reactive<FilterConfig>(defaultFilterConfig);
const isLoading = ref(true);
const i18nConfig = getNaiveUILocale();
const isMobile = isMobileSkin();
const isIconMode = ref(!!isMobile);
const { theme, toggleDark } = useTheme();
const pagination = reactive({
  page: 1,
  pageSize: 10,
  pageSizes: [10, 25, 50, 100],
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
const filteredEnemyData = computed(() => {
  const filters = filterConfig.states;
  const searchWord = keyword.value;
  const filteredData = enemyData.value.filter((enemy) => {
    for (const key in filters) {
      if (filters[key].length > 0) {
        if (
          filterConfig.groups[0].filters.includes(key) &&
          !filters[key].some(
            (filter) =>
              !!~enemy[key as keyof EnemyData].toString().indexOf(filter),
          )
        )
          return false;
        if (
          filterConfig.groups[1].filters.includes(key) &&
          !filters[key].includes(enemy[key as keyof EnemyData].toString())
        )
          return false;
      }
      if (
        searchWord &&
        !~enemy.name.indexOf(searchWord) &&
        !~enemy.ability.indexOf(searchWord)
      )
        return false;
    }
    return true;
  });
  return filteredData;
});
const filteredChunkedEnemyData = computed(() =>
  filteredEnemyData.value.slice(
    pagination.pageSize * (pagination.page - 1),
    pagination.pageSize * pagination.page,
  ),
);

watch(keyword, () => {
  tableRef.value?.filter({
    ability: [keyword.value],
    name: [keyword.value],
  });
});

const createFilterOptions = (field: string) => {
  return filterConfig.filters[field].options.map((option) => ({
    label: option,
    value: option,
  }));
};

const createDimensionalColumn = (
  field: keyof EnemyData,
  title: string,
): DataTableColumn<EnemyData> => {
  return {
    title,
    key: field,
    defaultSortOrder: false,
    sorter: (row1: EnemyData, row2: EnemyData) => {
      const index1 = dimensionPrecedence.indexOf(row1[field].toString());
      const index2 = dimensionPrecedence.indexOf(row2[field].toString());
      if (index1 === -1) {
        return 1;
      }
      if (index2 === -1) {
        return -1;
      }
      return index1 - index2;
    },
    filterOptions: createFilterOptions(field),
    filterOptionValues: filterConfig.states[field],
    filter(value: string | number, row: EnemyData) {
      return row[field] === value.toString();
    },
    renderFilter() {
      return h("div");
    },
  };
};

const abilityColumn: DataTableColumn<EnemyData> = {
  title: "能力",
  key: "ability",
  minWidth: 360,
  resizable: true,
  filter(value, row) {
    return (
      !!~row.ability.indexOf(value.toString()) ||
      !!~row.name.indexOf(value.toString())
    );
  },
  render(row) {
    nextTick(() => {
      for (const e of Array.from(document.querySelectorAll(".mc-tooltips"))) {
        if (!e.children || e.children.length < 2) continue;
        (e.children[1] as HTMLElement).style.display = "block";
        // @ts-expect-error tippy

        tippy6(e.children[0], {
          content: e.children[1],
          arrow: true,
          theme: "light-border",
          size: "large",
          maxWidth: Number.parseInt(
            (e.children[1] as HTMLElement).dataset.size!,
          ),
          trigger:
            (e.children[1] as HTMLElement).dataset.trigger ||
            "mouseenter focus",
        });
      }
    });
    return h("span", { innerHTML: row.ability });
  },
  renderFilter() {
    return h("div");
  },
};

const createColumns = (): DataTableColumns<EnemyData> => {
  return [
    {
      title: "头像",
      key: "icon",
      minWidth: 80,
      render(row) {
        const img = h("img", {
          "data-src": getImagePath(`头像_敌人_${row.name}.png`),
          class: "lazyload",
          style: {
            width: "65px",
            height: "65px",
          },
        });
        return h(
          "a",
          {
            href: `/w/${row.enemyLink}`,
          },
          img,
        );
      },
    },
    {
      title: "名称",
      key: "name",
      minWidth: 100,
      defaultSortOrder: false,
      resizable: true,
      sorter: "default",
      render(row) {
        return h(
          "a",
          {
            href: `/w/${row.enemyLink}`,
          },
          row.name,
        );
      },
      renderFilter() {
        return h("div");
      },
    },
    {
      title: "地位",
      key: "enemyLevel",
      resizable: true,
      minWidth: 80,
      filterOptions: createFilterOptions("enemyLevel"),
      filterOptionValues: filterConfig.states.enemyLevel,
      filter(value, row) {
        return !!~row.enemyLevel.indexOf(value.toString());
      },
      renderFilter() {
        return h("div");
      },
    },
    {
      title: "种类",
      key: "enemyRace",
      resizable: true,
      minWidth: 80,
      filterOptions: createFilterOptions("enemyRace"),
      filterOptionValues: filterConfig.states.enemyRace,
      filter(value, row) {
        return !!~row.enemyRace.indexOf(value.toString());
      },
      renderFilter() {
        return h("div");
      },
    },
    {
      title: "攻击方式",
      key: "attackType",
      resizable: true,
      minWidth: 105,
      filterOptions: createFilterOptions("attackType"),
      filterOptionValues: filterConfig.states.attackType,
      filter(value, row) {
        return !!~row.attackType.indexOf(value.toString());
      },
      renderFilter() {
        return h("div");
      },
    },
    {
      title: "伤害类型",
      key: "damageType",
      resizable: true,
      minWidth: 105,
      filterOptions: createFilterOptions("damageType"),
      filterOptionValues: filterConfig.states.damageType,
      filter(value, row) {
        return !!~row.damageType.indexOf(value.toString());
      },
      renderFilter() {
        return h("div");
      },
    },
    abilityColumn,
    ...filterConfig.groups[1].filters.map((field) =>
      createDimensionalColumn(
        field as keyof EnemyData,
        filterConfig.filters[field].title,
      ),
    ),
  ];
};

onMounted(async () => {
  const response = await fetch(
    `/index.php?${new URLSearchParams({
      title: "敌人一览/数据",
      action: "raw",
      ctype: "application/json",
    })}`,
  );

  enemyData.value = await response.json();
  isLoading.value = false;
});
const columns = createColumns();
const handleUpdateFilter = (
  filters: DataTableFilterState,
  sourceColumn: DataTableBaseColumn,
) => {
  abilityColumn.filterOptionValues = filters[sourceColumn.key] as string[];
};
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
      <div class="flex items-center">
        <NInput
          v-model:value="keyword"
          class="my-2"
          type="text"
          placeholder="搜索敌人名称/描述/能力"
        />
        <NButton
          class="mx-2"
          strong
          secondary
          :type="isIconMode ? 'info' : 'default'"
          @click="isIconMode = !isIconMode"
        >
          简
        </NButton>
        <div @click="toggleDark()">
          <NButton>
            <span v-if="theme" class="mdi mdi-brightness-6 text-2xl" />
            <span v-else class="mdi mdi-brightness-4 text-2xl" />
          </NButton>
        </div>
      </div>
      <NDataTable
        v-show="!isIconMode"
        ref="tableRef"
        class="my-2"
        :bordered="false"
        :columns="columns"
        :data="enemyData"
        :pagination="pagination"
        :row-key="(row) => row.name"
        striped
        @update:filters="handleUpdateFilter"
      />
      <div v-if="isIconMode">
        <a
          v-for="row in filteredChunkedEnemyData"
          :key="row.name"
          :href="`/w/${row.enemyLink}`"
        >
          <img
            class="lazyload min-h-[80px]"
            style="width: 80px; height: 80px"
            :data-src="getImagePath(`头像_敌人_${row.name}.png`)"
          />
        </a>
        <NPagination
          class="my-2 justify-center"
          :item-count="filteredEnemyData.length"
          :page="pagination.page"
          :page-size="pagination.pageSize"
          :page-sizes="pagination.pageSizes"
          :page-slot="pagination.pageSlot"
          :show-size-picker="pagination.showSizePicker"
          @update:page="pagination.onChange"
          @update:page-size="pagination.onUpdatePageSize"
        />
      </div>
    </NLayout>
  </NConfigProvider>
</template>

<style scoped>
:global(.page-敌人一览 .backToTop) {
  @apply hidden!;
}

.n-data-table :deep(.n-data-table__pagination) {
  @apply justify-center!;
}

:deep(.mc-tooltips) {
  @apply border-b-1 border-b-dotted border-b-black;
}
</style>
