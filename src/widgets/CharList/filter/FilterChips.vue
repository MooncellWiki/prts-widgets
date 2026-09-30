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

<style scoped lang="scss">
.ol-contents {
  display: contents;
}

.ak-chip {
  // 再点一下会筛出 0 条的选项压淡，仍可点
  &.is-empty:not([aria-pressed="true"]) {
    opacity: 0.38;
  }

  &:focus-visible {
    outline: 2px solid var(--ak-focus);
    outline-offset: 2px;
  }

  > .ol-ico {
    margin-left: -2px;
  }
}

// 分支：一职业一行，行首是职业图标
.ol-branch {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  flex: 1 1 100%;
  min-width: 0;

  &__prof {
    flex: none;
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    color: var(--ak-fg-muted);

    .ol-ico {
      width: 20px;
      height: 20px;
    }
  }

  &__list {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    min-width: 0;
  }
}

// 稀有度：一颗星 + 数字，星取稀有度色（选中后跟文字）
.ol-star {
  width: 11px;
  height: 11px;
  background: var(--ak-r-text);
  clip-path: polygon(
    50% 0%,
    61% 35%,
    98% 35%,
    68% 57%,
    79% 91%,
    50% 70%,
    21% 91%,
    32% 57%,
    2% 35%,
    39% 35%
  );

  .ak-chip[aria-pressed="true"] & {
    background: currentColor;
  }
}

.ol-chip--rarity {
  font-family: var(--ak-font-label);
  font-weight: 700;
  gap: 4px;
}
</style>
