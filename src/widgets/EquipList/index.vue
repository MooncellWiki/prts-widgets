<script setup lang="ts">
import { computed, ref, useTemplateRef } from "vue";

import { AkButton, AkEmpty, AkScope } from "@mooncellwiki/prts-design-vue";
import { useQuery } from "@pinia/colada";
import { useElementSize } from "@vueuse/core";

import { getLanguage } from "@/utils/i18n";
import { useTheme } from "@/utils/theme";
import { useHostTheme } from "@/utils/useHostTheme";

import Toolbar from "./Toolbar.vue";
import EquipGroup from "./components/EquipGroup.vue";
import EquipTable from "./components/EquipTable.vue";
import { customLabel, rarityMap } from "./consts";
import { equipListQuery } from "./equipData";
import FilterPanel from "./filter/FilterPanel.vue";
import ModuleFilterPanel from "./filter/ModuleFilterPanel.vue";
import {
  createEquipFilterSelection,
  createOperatorSelection,
  DEFAULT_SORT,
  GroupBy,
  RARITY_FILTER_OPTIONS,
  selectionCount,
  TYPE_FILTER_OPTIONS,
  View,
  type EquipFilterSelection,
  type EquipGroupBy,
  type EquipSort,
  type EquipView,
  type FilterGroup,
  type FilterOption,
  type OperatorFilterDef,
  type OperatorFilterId,
  type OperatorSelection,
} from "./filters";
import { matchesEquipSearch, matchesFilters, sortEquipRows } from "./query";
import { useEquipListStore } from "./store";

import type { CharEquips, EquipRow } from "./types";

const { isDark } = useTheme();
const scopeTheme = useHostTheme();
const locale = getLanguage();
const store = useEquipListStore();
const { data } = useQuery(equipListQuery);

const rawEquipData = computed(() => data.value?.chars ?? []);
/** 数据没到（含取数失败）和模组卡片还在处理时，筛选控件禁用 */
const busy = computed(() => !data.value || store.processing > 0);
const timeData = computed<FilterOption[]>(() =>
  (data.value?.time ?? []).map((item) => ({
    label: new Date(item.time * 1000).toLocaleDateString(locale),
    value: item.time.toString(),
  })),
);

/* 排布看结果区自己的宽度，不看视口（侧栏收起 / 展开都会改变它）：< 640 是手机排布 */
const root = useTemplateRef<HTMLElement>("root");
const { width } = useElementSize(
  root,
  { width: Number.POSITIVE_INFINITY, height: 0 },
  { box: "border-box" },
);

const view = ref<EquipView>(View.TABLE);
const group = ref<EquipGroupBy>(GroupBy.SUB);
const advancedOpen = ref(false);
const operatorSelection = ref<OperatorSelection>(createOperatorSelection());
const filterSelection = ref<EquipFilterSelection>(createEquipFilterSelection());
const searchQuery = ref("");
const sort = ref<EquipSort>({ ...DEFAULT_SORT });
const advancedCount = computed(() => selectionCount(filterSelection.value));

const resetAllFilters = () => {
  operatorSelection.value = createOperatorSelection();
  filterSelection.value = createEquipFilterSelection();
  searchQuery.value = "";
};

/** 职业 → 子职业（按干员出现的顺序） */
const subProfMap = computed(() => {
  const map: Record<string, string[]> = {};
  for (const { char } of rawEquipData.value) {
    const subs = (map[char.type] ??= []);
    if (!subs.includes(char.subtype)) subs.push(char.subtype);
  }
  return map;
});
const filteredSubProfMap = computed(() => {
  const map: Record<string, string[]> = {};
  if (operatorSelection.value.type.length === 0) return subProfMap.value;
  for (const type of operatorSelection.value.type) {
    map[type] = subProfMap.value[type] ?? [];
  }
  return map;
});

/** 职业 / 稀有度 / 分支三行的定义；分支选项随选中的职业收窄。 */
const operatorFilters = computed<OperatorFilterDef[]>(() => {
  const groups: FilterGroup[] = Object.entries(filteredSubProfMap.value).map(
    ([label, options]) => ({
      label,
      options: options.map((value) => ({ value, label: value })),
    }),
  );
  return [
    {
      id: "type",
      title: customLabel.typeLabel,
      options: TYPE_FILTER_OPTIONS,
    },
    {
      id: "rarity",
      title: customLabel.rarityLabel,
      options: RARITY_FILTER_OPTIONS,
    },
    {
      id: "sub",
      title: customLabel.subtypeLabel,
      options: groups.flatMap((group) => group.options),
      groups,
    },
  ];
});

/** 取消职业后，把不属于剩余职业的分支选择一起删掉（同干员一览）。 */
function pruneSubTypes() {
  if (operatorSelection.value.type.length === 0) return;
  const allowed = new Set(Object.values(filteredSubProfMap.value).flat());
  operatorSelection.value.sub = operatorSelection.value.sub.filter((name) =>
    allowed.has(name),
  );
}

function toggleOperator(id: OperatorFilterId, value: string) {
  const selected = operatorSelection.value[id];
  const index = selected.indexOf(value);
  if (index === -1) selected.push(value);
  else selected.splice(index, 1);
  if (id === "type") pruneSubTypes();
}

function clearOperator(id: OperatorFilterId) {
  operatorSelection.value[id] = [];
}

const filteredEquipData = computed((): CharEquips[] => {
  const selection = operatorSelection.value;
  const result: CharEquips[] = [];
  for (const charEquip of rawEquipData.value) {
    const rarityP =
      selection.rarity.length > 0 &&
      !selection.rarity.includes(
        rarityMap[charEquip.char.rarity.toString()] ?? "",
      );
    const subP =
      selection.sub.length > 0 &&
      !selection.sub.includes(charEquip.char.subtype);
    const typeP =
      selection.type.length > 0 &&
      !selection.type.includes(charEquip.char.type);
    if (rarityP || subP || typeP) continue;

    const equips = charEquip.equips.filter(
      (equip) =>
        matchesFilters(equip, filterSelection.value) &&
        matchesEquipSearch(charEquip.char, equip, searchQuery.value),
    );
    if (equips.length > 0)
      result.push({
        char: charEquip.char,
        equips,
      });
  }
  return result;
});

const CharEquipList = computed(() => {
  const result: EquipRow[] = [];
  for (const charEquip of filteredEquipData.value) {
    result.push(
      ...charEquip.equips.map((equip) => ({
        name: equip.name ?? "",
        type: equip.type ?? "",
        operator: charEquip.char.name,
        oprarity: charEquip.char.rarity,
        opid: charEquip.char.id,
        data: equip,
      })),
    );
  }
  return sortEquipRows(result, sort.value);
});
</script>

<template>
  <AkScope class="ep ak-not-prose" :theme="scopeTheme">
    <div
      :class="[
        'mx-auto max-w-3xl antialiased lg:max-w-[90rem] md:p-4',
        isDark && 'prts-widget-dark',
      ]"
    >
      <div ref="root" :class="['ep-root', { 'ep--narrow': width < 640 }]">
        <FilterPanel
          v-model:advanced-open="advancedOpen"
          :filters="operatorFilters"
          :selection="operatorSelection"
          :advanced-count="advancedCount"
          :disabled="busy"
          @toggle="toggleOperator"
          @clear="clearOperator"
        >
          <template #advanced>
            <ModuleFilterPanel
              v-model:selection="filterSelection"
              :time-options="timeData"
              :disabled="busy"
              :narrow="width < 640"
            />
          </template>
        </FilterPanel>

        <Toolbar
          v-model:q="searchQuery"
          v-model:sort="sort"
          v-model:view="view"
          v-model:group="group"
        />

        <AkScope tag="div" class="ep-result" :theme="scopeTheme">
          <AkEmpty v-if="CharEquipList.length === 0" title="没有符合条件的模组">
            放宽几项筛选条件，或者<AkButton
              variant="link"
              @click="resetAllFilters"
            >
              清除全部条件</AkButton
            >。
          </AkEmpty>
          <div v-else-if="view === View.TABLE">
            <EquipTable :data="CharEquipList" />
          </div>
          <div v-else>
            <EquipGroup :data="filteredEquipData" :group="group" />
          </div>
        </AkScope>
      </div>
    </div>
  </AkScope>
</template>

<style scoped>
@import "@/styles/dark-mode.scss";
</style>

<style scoped lang="scss">
// 别的皮肤上根节点带 data-theme（见 useHostTheme），设计系统会连画布底色一起铺；这里嵌在宿主正文里，不要那块底
.ep.ak-scope[data-theme],
.ep-result.ak-scope[data-theme] {
  background-color: transparent;
}

// 手机上给筛选面板留一点边，桌面交给外层 md:p-4
.ep-root {
  padding: 5px;
}

@media (min-width: 768px) {
  .ep-root {
    padding: 0;
  }
}
</style>
