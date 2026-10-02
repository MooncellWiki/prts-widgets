<script setup lang="ts">
import { computed, nextTick, useId, useTemplateRef } from "vue";

import {
  AkButton,
  AkButtonGroup,
  AkChip,
  useToast,
} from "@mooncellwiki/prts-design-vue";

import { professionLine } from "./assets";
import {
  DURATIONS,
  MAX_TAGS,
  TAG_GROUPS,
  isSenior,
  type DurIndex,
} from "./consts";
import { rarityBlocks } from "./recruit";
import { useRecruit } from "./store";

/**
 * 标签面板，照游戏的招募流程：
 *   面板头 = 招募位上的 5 格：选中的标签依次落进格子（点格子取消），空格是虚框带序号——一眼看得到还差几个；
 *   四行芯片（资质 / 位置 / 职业 / 词缀），选满 5 个后其余压淡（aria-disabled，仍可聚焦，再点给一句提示）；
 *   底栏 = 招募时限三档 + 游戏那排「可获得的干员」稀有度块。
 * 标签钮的皮照游戏（recruit_page 的 btn_tag_item）：普通标签选中青底；两个稀有标签未选金字金框、选中黄底黑字，落进格子是深灰底 + 黄色网点。
 */
const recruit = useRecruit();
const { state, solo, picked, full } = recruit;
const toast = useToast();

const panel = useTemplateRef<HTMLElement>("panel");
const id = useId();
const timeId = useId();

const empties = computed(() =>
  Array.from(
    { length: Math.max(0, MAX_TAGS - picked.value.length) },
    (_, i) => picked.value.length + i + 1,
  ),
);
const blocks = computed(() => rarityBlocks(state.dur, state.sel));

function onChip(tag: string) {
  if (!recruit.toggle(tag))
    toast.warning(`一个招募位只出现 ${MAX_TAGS} 个标签，先取消一个再选。`, {
      title: "已选满",
    });
}

/** 格子重画了：焦点落到剩下的第一格，没有了就落到第一枚芯片 */
async function unslot(tag: string) {
  recruit.toggle(tag);
  await nextTick();
  panel.value?.querySelector<HTMLElement>("button.hr-slot, .ak-chip")?.focus();
}

/** 单选即可保底的标签：右上角一枚稀有度色的小方块 */
const soloAttrs = (tag: string) => {
  const min = solo.get(tag);
  return min
    ? { "data-solo": "", "data-rarity": min, title: `单选即可保底 ${min}★` }
    : {};
};
</script>

<template>
  <section ref="panel" class="hr-pick" aria-label="职业需求">
    <div class="hr-pick__head">
      <div class="hr-pick__title">
        <span>职业需求</span><span class="ak-en">Job Tags</span>
      </div>
      <!-- 紧跟标题：选完一个招募位、清空再选下一个，按钮就在面板起手的位置 -->
      <div class="hr-pick__tools">
        <span class="hr-count" role="status">
          {{ state.sel.size }}<small>/ {{ MAX_TAGS }}</small>
        </span>
        <AkButton
          size="sm"
          icon="refresh"
          :disabled="state.sel.size === 0"
          @click="recruit.clear()"
        >
          清空
        </AkButton>
      </div>
      <ol class="hr-slots" :aria-label="`已选标签（最多 ${MAX_TAGS} 个）`">
        <li v-for="tag in picked" :key="tag">
          <button
            type="button"
            :class="['hr-slot', { 'is-senior': isSenior(tag) }]"
            :aria-label="`取消「${tag}」`"
            @click="unslot(tag)"
          >
            <span>{{ tag }}</span>
          </button>
        </li>
        <li v-for="n in empties" :key="`empty-${n}`">
          <span class="hr-slot hr-slot--empty" aria-hidden="true">
            {{ String(n).padStart(2, "0") }}
          </span>
        </li>
      </ol>
    </div>

    <div class="hr-rows">
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
            :aria-disabled="!state.sel.has(tag) && full"
            v-bind="soloAttrs(tag)"
            @update:model-value="onChip(tag)"
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
    </div>

    <div class="hr-time">
      <span :id="timeId" class="hr-time__label">招募时限</span>
      <AkButtonGroup :aria-labelledby="timeId">
        <AkButton
          v-for="(d, i) in DURATIONS"
          :key="d.label"
          :aria-pressed="state.dur === i"
          @click="recruit.setDur(i as DurIndex)"
        >
          {{ d.label }}<small>{{ d.lo }} – {{ d.hi }}★</small>
        </AkButton>
      </AkButtonGroup>
      <span class="hr-rar">
        <span class="hr-time__label">可获得的干员</span>
        <span class="hr-rar__list" role="status">
          <span
            v-for="b in blocks"
            :key="b.star"
            :class="{ 'is-up': b.up }"
            :title="b.up ? '选上对应的稀有标签才出' : undefined"
          >
            {{ b.star }}★
          </span>
        </span>
      </span>
    </div>
  </section>
</template>

<style scoped lang="scss">
@use "./mixins";

.hr-pick {
  margin: 0 0 var(--ak-space-3);
  background: var(--ak-bg-surface);
  border: 1px solid var(--ak-border);

  &__head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px var(--ak-space-4);
    padding: 10px var(--ak-space-3);
    background: var(--ak-bg-surface-2);
    border-bottom: 1px solid var(--ak-border);
    border-left: var(--ak-bar-w) solid var(--ak-accent);
  }

  &__title {
    flex: none;
    display: flex;
    flex-direction: column;
    gap: 3px;
    font-weight: 700;
    font-size: var(--ak-fs-sm);
    line-height: 1.1;

    .ak-en {
      font-size: 10px;
      color: var(--ak-fg-subtle);
    }

    .hr--narrow & {
      flex-direction: row;
      align-items: baseline;
      gap: 8px;
    }
  }

  &__tools {
    flex: none;
    display: flex;
    align-items: center;
    gap: 10px;

    :deep(.ak-icon) {
      width: 14px;
      height: 14px;
    }

    .hr--narrow & {
      margin-left: auto;
    }
  }
}

.hr-count {
  font: 700 var(--ak-fs-body) / 1 var(--ak-font-label);
  font-variant-numeric: tabular-nums;
  color: var(--ak-fg);
  white-space: nowrap;

  small {
    font-weight: 600;
    font-size: var(--ak-fs-xs);
    color: var(--ak-fg-muted);
    margin-left: 2px;
  }
}

// ── 招募位上的 5 格 ──
.hr-slots {
  flex: 1 1 420px;
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 6px;
  min-width: 0;
  margin: 0;
  padding: 0;
  list-style: none;

  > li {
    display: flex;
    min-width: 0;
    margin: 0;
  }

  // 手机上 5 格放不下「高级资深干员」：格子随内容宽、折行
  .hr--narrow & {
    order: 1;
    flex-basis: 100%;
    display: flex;
    flex-wrap: wrap;

    > li {
      flex: 1 1 auto;
    }
  }
}

.hr-slot {
  all: unset;
  box-sizing: border-box;
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 34px;
  padding: 0 8px;
  font-weight: 600;
  font-size: var(--ak-fs-sm);
  white-space: nowrap;

  &--empty {
    border: 1px dashed var(--ak-border-strong);
    color: var(--ak-fg-subtle);
    font: 600 var(--ak-fs-xs) / 1 var(--ak-font-label);
    letter-spacing: 0.08em;

    .hr--narrow & {
      min-width: 44px;
    }
  }
}

button.hr-slot {
  cursor: pointer;
  background: var(--ak-gray-800);
  color: #fff;
  box-shadow: 0 2px 0 rgba(0, 0, 0, 0.28);

  > span {
    overflow: hidden;
    text-overflow: ellipsis;
  }

  &::after {
    content: "×";
    flex: none;
    font-size: 15px;
    line-height: 1;
    opacity: 0.5;
  }

  &:hover {
    background: var(--ak-gray-700);

    &::after {
      opacity: 1;
    }
  }

  &:focus-visible {
    @include mixins.focus-ring;
  }

  &.is-senior {
    @include mixins.senior-btn;

    &:hover {
      background-color: var(--ak-gray-800);
    }
  }
}

// ── 四行芯片（同干员一览的筛选行）──
.hr-rows {
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr);

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

  &[aria-disabled="true"] {
    opacity: 0.38;
    cursor: not-allowed;

    &:hover {
      border-color: var(--ak-border-strong);
      color: var(--ak-fg-secondary);
    }
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

// ── 招募时限（面板底栏）──
.hr-time {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px var(--ak-space-4);
  padding: 10px var(--ak-space-3) 10px calc(var(--ak-space-3) + var(--ak-bar-w));
  background: var(--ak-bg-surface-2);
  border-top: 1px solid var(--ak-border);

  &__label {
    font-weight: 600;
    font-size: var(--ak-fs-sm);
    color: var(--ak-fg-secondary);
    white-space: nowrap;
  }

  .ak-btn-group {
    flex-wrap: nowrap;
  }

  .ak-btn {
    flex-direction: column;
    gap: 3px;
    min-height: 44px;
    padding: 0 var(--ak-space-4);
    font: 700 var(--ak-fs-body) / 1 var(--ak-font-label);
    font-variant-numeric: tabular-nums;

    small {
      font: 500 max(10px, var(--ak-fs-cjk-min)) / 1 var(--ak-font-body);
      color: var(--ak-fg-muted);
    }

    &[aria-pressed="true"] {
      --_bg: var(--ak-accent);
      --_fg: var(--ak-accent-fg);
      --_bd: var(--ak-accent);

      z-index: 1;

      small {
        color: inherit;
        opacity: 0.8;
      }
    }
  }

  .hr--narrow & {
    padding-left: var(--ak-space-3);

    .ak-btn-group {
      display: flex;
      width: 100%;
    }

    .ak-btn {
      flex: 1 1 0;
      min-width: 0;
      padding: 0 4px;
    }
  }
}

// 「可获得的干员」：范围内的蓝底白字；选了稀有标签，它对应的那一星变黄
.hr-rar {
  display: inline-flex;
  align-items: center;
  gap: 8px;

  &__list {
    display: inline-flex;
    gap: 4px;

    > span {
      display: grid;
      place-items: center;
      min-width: 34px;
      height: 24px;
      padding: 0 4px;
      box-sizing: border-box;
      background: var(--ak-blue-500);
      color: #fff;
      font: 700 var(--ak-fs-sm) / 1 var(--ak-font-label);

      &.is-up {
        background: #fbd501;
        color: #313131;
      }
    }
  }
}
</style>
