<script setup lang="ts">
import { computed, useId } from "vue";

import { AkTag } from "@mooncellwiki/prts-design-vue";
import { storeToRefs } from "pinia";

import { useCharListStore } from "../store";

import AdvancedFilter from "./AdvancedFilter.vue";
import FilterChips from "./FilterChips.vue";
import FilterRow from "./FilterRow.vue";

/**
 * 筛选面板，分两层：
 *   常用（一直在）：职业 / 稀有度 · 位置。分支不平铺——选了职业才出那几个职业的分支（游戏的筛选面板同）；
 *   高级筛选（一枚整行的开关钮，默认收起）：其余各行按「筛什么」归类分页签。
 * 不管收起与否，已选条件都在结果栏里列着，高级筛选钮上也有已选数。
 */
defineProps<{ narrow: boolean }>();

const store = useCharListStore();
const panelId = useId();
const positionId = useId();

const { profession, branch, tabs, advanced } = storeToRefs(store);
const rarity = computed(() => store.byField("rarity"));
const position = computed(() => store.byField("position"));

/** 没选职业却带着分支（旧的短链接可以这样）时整行照出，不然那个条件看不见也取消不了 */
const showBranch = computed(
  () =>
    !!branch.value &&
    (!!profession.value?.sel.size || branch.value.sel.size > 0),
);

const advancedCount = computed(() =>
  tabs.value.reduce(
    (sum, tab) => sum + tab.filters.reduce((n, f) => n + f.sel.size, 0),
    0,
  ),
);
/** 钮上写着里面有什么：第一类列出各行的名字，其余写类名 */
const advancedWhat = computed(() =>
  tabs.value
    .map((tab, i) =>
      i === 0 ? tab.filters.map((f) => f.title).join(" · ") : tab.title,
    )
    .join(" · "),
);
</script>

<template>
  <section class="ol-filter" aria-label="筛选">
    <div class="ol-rows">
      <FilterRow v-if="profession" :filter="profession">
        <span v-if="branch && !showBranch" class="ol-hint">
          选了职业可再选分支
        </span>
      </FilterRow>
      <FilterRow v-if="branch && showBranch" :filter="branch" />
      <FilterRow v-if="rarity" :filter="rarity">
        <span
          v-if="position"
          :class="['ol-inline', { 'has-active': position.sel.size > 0 }]"
          role="group"
          :aria-labelledby="positionId"
        >
          <span :id="positionId" class="ol-inline__label">
            {{ position.title }}
          </span>
          <FilterChips :filter="position" />
        </span>
      </FilterRow>
      <FilterRow v-else-if="position" :filter="position" />
    </div>

    <template v-if="tabs.length > 0">
      <button
        type="button"
        :class="['ol-more', { 'has-active': advancedCount > 0 }]"
        :aria-expanded="advanced.open"
        :aria-controls="panelId"
        @click="advanced.open = !advanced.open"
      >
        <span>高级筛选</span>
        <span class="ak-en">Advanced</span>
        <AkTag v-if="advancedCount" size="sm" variant="accent-soft">
          已选 {{ advancedCount }}
        </AkTag>
        <span class="ol-more__what">{{ advancedWhat }}</span>
      </button>
      <AdvancedFilter v-show="advanced.open" :id="panelId" :narrow="narrow" />
    </template>
  </section>
</template>
