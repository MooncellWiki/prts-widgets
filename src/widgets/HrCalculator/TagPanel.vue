<script setup lang="ts">
import { useId } from "vue";

import { AkChip } from "@mooncellwiki/prts-design-vue";

import { professionLine } from "./assets";
import { TAG_GROUPS, isSenior } from "./consts";
import { useRecruit } from "./store";

/**
 * 标签面板：四行芯片（资质 / 职业 / 位置 / 词缀，次序同游戏招募页，见 consts.ts 的 TAG_GROUPS），个数不限；清空在面板下面那条工具栏里（VerdictBar）。
 * 两个稀有标签另一套皮，同游戏 recruit_page 的 btn_tag_item：未选金字金框、选中黄底黑字（普通标签选中青底）。
 * 单选就能保底 4★ 以上的标签，右上角一枚保底稀有度色的小方块。
 */
const recruit = useRecruit();
const { state, solo } = recruit;

const id = useId();

/** 单选即可保底的标签：右上角一枚稀有度色的小方块 */
const soloAttrs = (tag: string) => {
  const min = solo.get(tag);
  return min
    ? { "data-solo": "", "data-rarity": min, title: `单选即可保底 ${min}★` }
    : {};
};
</script>

<template>
  <section class="hr-pick" aria-label="职业需求">
    <div
      v-for="(group, gi) in TAG_GROUPS"
      :key="group.title"
      :class="[
        'hr-row',
        { 'has-active': group.tags.some((t) => state.sel.has(t)) },
      ]"
      role="group"
      :aria-labelledby="`${id}-${gi}`"
    >
      <div :id="`${id}-${gi}`" class="hr-row__label">{{ group.title }}</div>
      <div class="hr-row__opts">
        <AkChip
          v-for="tag in group.tags"
          :key="tag"
          :model-value="state.sel.has(tag)"
          :class="{ 'is-senior': isSenior(tag) }"
          v-bind="soloAttrs(tag)"
          @update:model-value="recruit.toggle(tag)"
        >
          <i
            v-if="professionLine(tag)"
            class="hr-ico"
            :style="{ maskImage: `url(&quot;${professionLine(tag)}&quot;)` }"
            aria-hidden="true"
          />{{ tag }}
        </AkChip>
      </div>
    </div>
  </section>
</template>

<style scoped lang="scss">
@use "./mixins";

// 四行芯片，同干员一览的筛选行
.hr-pick {
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr);
  margin: 0 0 var(--ak-space-3);
  background: var(--ak-bg-surface);
  border: 1px solid var(--ak-border);

  .hr--narrow & {
    grid-template-columns: minmax(0, 1fr);
  }
}

.hr-row {
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

  &__opts {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    padding: 8px var(--ak-space-3) 8px 0;
    min-width: 0;
  }

  // 窄排布：标签在上、芯片在下，青条接着往下画满一行
  .hr--narrow & {
    grid-template-columns: minmax(0, 1fr);

    &__label {
      padding: 8px var(--ak-space-3) 0 8px;
    }

    &__opts {
      padding: 8px var(--ak-space-3) 10px calc(8px + var(--ak-bar-w));
    }

    &.has-active > .hr-row__opts {
      box-shadow: inset var(--ak-bar-w) 0 0 var(--ak-accent);
    }
  }
}

.ak-chip {
  height: 30px;

  &:focus-visible {
    @include mixins.focus-ring;
  }

  &.is-senior:not([aria-pressed="true"]) {
    color: var(--ak-rarity-5-text);
    border-color: color-mix(in srgb, var(--ak-rarity-5-text) 55%, transparent);
    font-weight: 700;
  }

  &.is-senior[aria-pressed="true"] {
    background: var(--ak-yellow-500);
    border-color: var(--ak-yellow-500);
    color: #1d1f20;
  }

  // 单选这一个标签就能保底 4★ 以上（9:00）：右上角一枚稀有度色的小方块
  &[data-solo]::after {
    content: "";
    position: absolute;
    top: -1px;
    right: -1px;
    width: 7px;
    height: 7px;
    background: var(--ak-r);
  }

  &[data-solo][aria-pressed="true"]::after {
    top: 2px;
    right: 2px;
    width: 5px;
    height: 5px;
  }
}

// 职业图标 = 游戏筛选面板的白线稿当遮罩、颜色取 currentColor，同干员一览
.hr-ico {
  flex: none;
  width: 16px;
  height: 16px;
  margin-left: -2px;
  background: currentColor;
  -webkit-mask: center / contain no-repeat;
  mask: center / contain no-repeat;
}
</style>
