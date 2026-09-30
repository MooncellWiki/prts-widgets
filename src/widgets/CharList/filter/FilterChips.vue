<script setup lang="ts">
import { computed } from "vue";

import { AkChip } from "@mooncellwiki/prts-design-vue";

import MaskIcon from "../MaskIcon.vue";
import { branchLine, professionLine } from "../assets";
import { useCharListStore } from "../store";

import type { FilterState } from "../filter";

/** 一行筛选的选项芯片；职业 / 分支 / 稀有度各有自己的画法 */
const props = defineProps<{
  filter: FilterState;
  /** 「找选项」：只留名字里含这几个字的芯片（已选的一直留着） */
  find?: string;
}>();

const store = useCharListStore();

const empty = computed(() => store.empties.get(props.filter.field));
const shown = (label: string) =>
  !props.find ||
  props.filter.sel.has(label) ||
  label.toLowerCase().includes(props.find);
const chip = (label: string) => ({
  modelValue: props.filter.sel.has(label),
  class: { "is-empty": empty.value?.has(label) },
  "onUpdate:modelValue": () => store.toggle(props.filter, label),
});

/** 分支：一职业一组，选了职业只列那几个职业的；数据里还没有干员的分支不归组，排在最后 */
const branchGroups = computed(() => {
  const selected = store.byField("profession")?.sel;
  return store.profOrder
    .filter((prof) => !selected?.size || selected.has(prof))
    .map((prof) => ({
      prof,
      labels: props.filter.labels.filter(
        (l) => store.branchProf.get(l) === prof,
      ),
    }))
    .filter((group) => group.labels.length > 0);
});
const looseBranches = computed(() =>
  props.filter.labels.filter((l) => !store.branchProf.has(l)),
);
</script>

<template>
  <template v-if="filter.field === 'profession'">
    <AkChip v-for="l in filter.labels" :key="l" v-bind="chip(l)">
      <MaskIcon :src="professionLine(l)" />{{ l }}
    </AkChip>
  </template>

  <template v-else-if="filter.field === 'rarity'">
    <!-- 外面包一层拿稀有度色（--ak-r-text），display: contents 不影响排布 -->
    <span
      v-for="l in filter.labels"
      :key="l"
      class="ol-contents"
      :data-rarity="l.slice(1)"
    >
      <AkChip v-bind="chip(l)" class="ol-chip--rarity">
        <i class="ol-star" aria-hidden="true" />{{ l.slice(1)
        }}<span class="ak-sr-only">星</span>
      </AkChip>
    </span>
  </template>

  <template v-else-if="filter.field === 'subProfession'">
    <div
      v-for="group in branchGroups"
      :key="group.prof"
      class="ol-branch"
      role="group"
      :aria-label="`${group.prof}分支`"
    >
      <span class="ol-branch__prof" :title="group.prof">
        <MaskIcon :src="professionLine(group.prof)" />
      </span>
      <div class="ol-branch__list">
        <AkChip v-for="l in group.labels" :key="l" v-bind="chip(l)">
          <MaskIcon :src="branchLine(l)" />{{ l }}
        </AkChip>
      </div>
    </div>
    <AkChip v-for="l in looseBranches" :key="l" v-bind="chip(l)">
      {{ l }}
    </AkChip>
  </template>

  <template v-else>
    <AkChip
      v-for="l in filter.labels"
      v-show="shown(l)"
      :key="l"
      v-bind="chip(l)"
    >
      {{ l }}
    </AkChip>
  </template>
</template>
