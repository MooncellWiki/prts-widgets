<script setup lang="ts">
import { computed, useId } from "vue";

import { AkChip } from "@mooncellwiki/prts-design-vue";

import { eliteIcon, professionLine } from "../assets";
import { glyphStyle, roomVars } from "../room";
import { useBaseSkillList } from "../store";

import type { Room } from "../data";
import type { FilterOption, FilterState } from "../filter";

/**
 * 一行筛选 = 标签列 + 选项芯片（排布同道具一览的筛选行）。选中后标签左缘出青条、露出「清除」；不设「全选」。
 * 设施芯片带设施线稿（线稿取设施色，选中后跟文字）；作用对象一个设施一段、段首是设施名；
 * 解锁阶段带精英图标；稀有度是星 + 数字、职业带职业线稿（同干员一览）。
 */
const props = defineProps<{
  filter: FilterState;
  /** 作用对象行：出哪几个设施的段（段首的设施名就说明了这一行管哪几个设施） */
  groups?: readonly Room[];
}>();

const store = useBaseSkillList();
const id = useId();

const empty = computed(() => store.empties.value.get(props.filter.id));
const chip = (option: FilterOption) => ({
  modelValue: props.filter.selected.has(option.id),
  class: { "is-empty": empty.value?.has(option.id) },
  "onUpdate:modelValue": () => store.toggle(props.filter, option.id),
});
const optionsOf = (room: Room) =>
  props.filter.def.options.filter((o) => o.room === room);
/** 设施页里只有一段，段首的设施名就不写了 */
const groupLabel = computed(
  () => (props.groups?.length ?? 0) > 1 || !store.room,
);
</script>

<template>
  <div
    :class="['rs-row', { 'has-active': filter.selected.size > 0 }]"
    role="group"
    :aria-labelledby="id"
  >
    <div class="rs-row__label">
      <span :id="id">
        {{ filter.def.title }}
      </span>
      <button
        type="button"
        class="rs-row__clear"
        :aria-label="`清除「${filter.def.title}」的选择`"
        @click="store.clear(filter)"
      >
        清除
      </button>
    </div>
    <div class="rs-row__opts">
      <template v-if="filter.id === 'room'">
        <AkChip
          v-for="option in filter.def.options"
          :key="option.id"
          v-bind="chip(option)"
          data-rc
          :style="roomVars(option.room!)"
        >
          <span class="rs-gl"
            ><i
              class="rs-glyph"
              :style="glyphStyle(option.room!.glyph)"
              aria-hidden="true"
            />{{ option.label }}</span
          >
        </AkChip>
      </template>
      <template v-else-if="groups">
        <div
          v-for="room in groups"
          :key="room.id"
          class="rs-group"
          role="group"
          :aria-label="room.name"
        >
          <span v-if="groupLabel" class="rs-group__label" aria-hidden="true">
            {{ room.name }}
          </span>
          <div class="rs-group__list">
            <AkChip
              v-for="option in optionsOf(room)"
              :key="option.id"
              v-bind="chip(option)"
            >
              {{ option.label }}
            </AkChip>
          </div>
        </div>
      </template>
      <template v-else-if="filter.id === 'phase'">
        <AkChip
          v-for="option in filter.def.options"
          :key="option.id"
          v-bind="chip(option)"
        >
          <span class="rs-gl"
            ><img
              class="rs-chip-elite"
              :src="eliteIcon(option.phase ?? 0)"
              alt=""
            />{{ option.label }}</span
          >
        </AkChip>
      </template>
      <template v-else-if="filter.id === 'rarity'">
        <!-- 外面包一层拿稀有度色（--ak-r-text），display: contents 不影响排布 -->
        <span
          v-for="option in filter.def.options"
          :key="option.id"
          class="rs-contents"
          :data-rarity="option.id"
        >
          <AkChip v-bind="chip(option)" class="rs-chip-rarity">
            <i class="rs-star" aria-hidden="true" />{{ option.label
            }}<span class="ak-sr-only">星</span>
          </AkChip>
        </span>
      </template>
      <template v-else>
        <AkChip
          v-for="option in filter.def.options"
          :key="option.id"
          v-bind="chip(option)"
        >
          <span class="rs-gl"
            ><i
              class="rs-glyph"
              :style="glyphStyle(professionLine(option.id))"
              aria-hidden="true"
            />{{ option.label }}</span
          >
        </AkChip>
      </template>
    </div>
  </div>
</template>

<style scoped lang="scss">
.rs-row {
  display: grid;
  // 不认 subgrid 的浏览器各行自己定宽
  grid-template-columns: max-content minmax(0, 1fr);
  grid-column: 1 / -1;

  @supports (grid-template-columns: subgrid) {
    grid-template-columns: subgrid;
  }

  & + & {
    border-top: 1px solid var(--ak-border);
  }

  &__label {
    display: flex;
    align-items: baseline;
    align-content: start;
    gap: 10px;
    padding: 12px var(--ak-space-4) 8px var(--ak-space-3);
    border-left: var(--ak-bar-w) solid transparent;
    font-weight: 600;
    font-size: var(--ak-fs-sm);
    line-height: 1.4;
    color: var(--ak-fg-secondary);
    white-space: nowrap;
  }

  &.has-active > &__label {
    border-left-color: var(--ak-accent);
    color: var(--ak-fg);
  }

  &__clear {
    all: unset;
    font-size: var(--ak-fs-xs);
    font-weight: 500;
    color: var(--ak-link);
    cursor: pointer;

    &:hover {
      text-decoration: underline;
    }

    &:focus-visible {
      outline: 2px solid var(--ak-focus);
      outline-offset: 2px;
    }
  }

  // 没选中时只藏不撤，标签列的宽度不随选中跳动
  &:not(.has-active) &__clear {
    visibility: hidden;
  }

  &__opts {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    padding: 8px var(--ak-space-3) 8px 0;
    min-width: 0;
  }

  // 窄排布：标签在上、选项在下
  .rs--narrow & {
    grid-template-columns: minmax(0, 1fr);

    &__label {
      align-items: center;
      padding: 8px var(--ak-space-3) 0 8px;
      white-space: normal;
    }

    &__opts {
      padding: 8px var(--ak-space-3) 10px calc(8px + var(--ak-bar-w));
    }

    // 青条接着往下画满一行
    &.has-active > .rs-row__opts {
      box-shadow: inset var(--ak-bar-w) 0 0 var(--ak-accent);
    }
  }
}

.rs-contents {
  display: contents;
}

.ak-chip {
  // 点了也不会多出技能的选项压淡，仍可点
  &.is-empty:not([aria-pressed="true"]) {
    opacity: 0.38;
  }

  &:focus-visible {
    outline: 2px solid var(--ak-focus);
    outline-offset: 2px;
  }

  // 设施线稿取设施色（--rs-room 由 data-rc 选），选中后跟文字；职业线稿一直跟文字。
  // 线稿与字的对齐见 index.vue 的 .rs-gl
  .rs-glyph {
    margin-left: -2px;
  }

  &[data-rc] .rs-glyph {
    color: var(--rs-room, currentColor);
  }

  &[aria-pressed="true"] .rs-glyph {
    color: currentColor;
  }
}

// 作用对象：一个设施一段，段首是设施名
.rs-group {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  min-width: 0;

  &__label {
    flex: none;
    font-size: var(--ak-fs-xs);
    line-height: 28px;
    color: var(--ak-fg-muted);
    white-space: nowrap;
  }

  &__list {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    min-width: 0;
  }

  .rs--narrow & {
    flex-direction: column;
    gap: 2px;

    &__label {
      line-height: 1.6;
    }
  }
}

// 解锁阶段：精英图标是白色线稿，亮色主题反相（同 .ak-elite），选中后在主色底上照原样。
// 同 .rs-gl 里的线稿，中线对着汉字的字面中线（基线上 0.38em）
.rs-chip-elite {
  width: 18px;
  height: 14px;
  margin: 0 6px 0 -4px;
  object-fit: contain;
  vertical-align: calc(0.38em - 7px);
  filter: var(--ak-glyph-filter);

  .ak-chip[aria-pressed="true"] & {
    filter: none;
  }
}

// 稀有度：一颗星 + 数字，星取稀有度色（选中后跟文字），同干员一览
.rs-chip-rarity {
  font-family: var(--ak-font-label);
  font-weight: 700;
  gap: 4px;
}

.rs-star {
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
</style>
