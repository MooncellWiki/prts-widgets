<script setup lang="ts">
import { computed, useId } from "vue";

import {
  AkButton,
  AkButtonGroup,
  AkSearch,
  AkSelect,
  AkSwitch,
  type IconName,
  type SelectGroupOption,
  type SelectOption,
} from "@mooncellwiki/prts-design-vue";
import { storeToRefs } from "pinia";

import { STAT_COLS, View, type SortKey, type ViewMode } from "./consts";
import { useCharListStore } from "./store";

/** 工具条：搜索 · 排序（排序项 + 升降，同游戏的排序钮一项两个方向）· 数值加算 · 显示方式 */
const store = useCharListStore();
const { state } = store;
const { sortStat } = storeToRefs(store);
const sortId = useId();

const SORT_OPTIONS: (SelectOption | SelectGroupOption)[] = [
  { label: "实装时间", value: "time" },
  { label: "名称", value: "name" },
  { label: "稀有度", value: "rarity" },
  {
    type: "group",
    label: "数值",
    children: STAT_COLS.map((col) => ({ label: col.full, value: col.key })),
  },
];
const VIEWS: { view: ViewMode; label: string; icon: IconName }[] = [
  { view: View.TABLE, label: "表格", icon: "table" },
  { view: View.HALF, label: "半身像", icon: "user" },
  { view: View.AVATAR, label: "头像", icon: "grid" },
];

const descending = computed(() => state.sort.dir < 0);
/** 半身像 / 头像不显示数值，加算开关只在按数值排序时还有用 */
const showAddons = computed(
  () => state.view === View.TABLE || sortStat.value !== null,
);
</script>

<template>
  <div class="ol-toolbar">
    <AkSearch
      v-model="state.q"
      class="ol-toolbar__search"
      placeholder="搜索干员名称 / 代号 / 特性"
      label="搜索干员名称、代号或特性"
      autocomplete="off"
    />
    <div class="ol-field ol-sort">
      <label :for="sortId">排序</label>
      <AkSelect
        :id="sortId"
        :model-value="state.sort.key"
        :options="SORT_OPTIONS"
        @update:model-value="store.setSortKey($event as SortKey)"
      />
      <AkButton
        :label="`排序方向：${descending ? '降序' : '升序'}，点击切换`"
        @click="store.flipSort()"
      >
        {{ descending ? "降序 ↓" : "升序 ↑" }}
      </AkButton>
    </div>
    <div v-if="showAddons" class="ol-field" role="group" aria-label="数值加算">
      数值
      <AkSwitch v-model="state.pot" size="sm">满潜能</AkSwitch>
      <AkSwitch v-model="state.trust" size="sm">满信赖</AkSwitch>
    </div>
    <AkButtonGroup class="ol-view" label="显示方式">
      <AkButton
        v-for="v in VIEWS"
        :key="v.view"
        :icon="v.icon"
        :aria-pressed="state.view === v.view"
        @click="store.setView(v.view)"
      >
        {{ v.label }}
      </AkButton>
    </AkButtonGroup>
  </div>
</template>
