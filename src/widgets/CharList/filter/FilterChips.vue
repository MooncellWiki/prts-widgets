<script setup lang="ts">
import { computed } from "vue";

import { AkChip } from "@mooncellwiki/prts-design-vue";

import MaskIcon from "../MaskIcon.vue";
import { branchLine, professionLine } from "../assets";
import { optionShown, type FilterState } from "../filter";
import { useCharListStore } from "../store";

import type { FilterOption } from "../filters";

/** 一行筛选的选项芯片；职业 / 分支 / 稀有度各有自己的画法 */
const props = defineProps<{
  filter: FilterState;
  /** 「找选项」：只留名字里含这几个字的芯片（已选的一直留着） */
  find?: string;
}>();

const store = useCharListStore();

const empty = computed(() => store.empties.get(props.filter.id));
const shown = (option: FilterOption) =>
  optionShown(props.filter, option, props.find ?? "");
const chip = (id: string) => ({
  modelValue: props.filter.selection.selected.has(id),
  class: { "is-empty": empty.value?.has(id) },
  "onUpdate:modelValue": () => store.toggle(props.filter, id),
});
</script>

<template>
  <template v-if="filter.id === 'profession'">
    <AkChip
      v-for="option in filter.def.options"
      :key="option.id"
      v-bind="chip(option.id)"
    >
      <MaskIcon :src="professionLine(option.id)" />{{ option.label }}
    </AkChip>
  </template>

  <template v-else-if="filter.id === 'rarity'">
    <!-- 外面包一层拿稀有度色（--ak-r-text），display: contents 不影响排布 -->
    <span
      v-for="option in filter.def.options"
      :key="option.id"
      class="ol-contents"
      :data-rarity="option.id"
    >
      <AkChip v-bind="chip(option.id)" class="ol-chip--rarity">
        <i class="ol-star" aria-hidden="true" />{{ option.id
        }}<span class="ak-sr-only">星</span>
      </AkChip>
    </span>
  </template>

  <template v-else-if="filter.id === 'subProfession'">
    <div
      v-for="group in store.branchGroups"
      :key="group.name"
      class="ol-branch"
      role="group"
      :aria-label="`${group.name}分支`"
    >
      <span class="ol-branch__prof" :title="group.name">
        <MaskIcon :src="professionLine(group.name)" />
      </span>
      <div class="ol-branch__list">
        <AkChip
          v-for="branch in group.branches"
          :key="branch.name"
          v-bind="chip(branch.name)"
        >
          <MaskIcon :src="branchLine(branch.name)" />{{ branch.name }}
        </AkChip>
      </div>
    </div>
  </template>

  <template v-else>
    <AkChip
      v-for="option in filter.def.options"
      v-show="shown(option)"
      :key="option.id"
      v-bind="chip(option.id)"
    >
      {{ option.label }}
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
