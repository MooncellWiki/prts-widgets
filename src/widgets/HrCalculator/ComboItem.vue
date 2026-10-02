<script setup lang="ts">
import { computed, ref } from "vue";

import OpTile from "./OpTile.vue";
import { isSenior } from "./consts";

import type { Combo } from "./recruit";

/**
 * 一组：左边是标签（游戏的深灰标签钮）+「几位 · 几星到几星」，右边是干员。
 * 一组超过 28 位（单选【资深干员】= 全部 5★）先出 24 位，其余收在「+N」后面。
 */
const props = defineProps<{ combo: Combo }>();

const FOLD = 24;
const expanded = ref(false);
const folded = computed(
  () => !expanded.value && props.combo.ops.length > FOLD + 4,
);
const shown = computed(() =>
  folded.value ? props.combo.ops.slice(0, FOLD) : props.combo.ops,
);
const range = computed(() => {
  const { min, ops } = props.combo;
  return ops[0].star > min ? `${min}–${ops[0].star}` : `${min}`;
});
</script>

<template>
  <li class="hr-combo" :data-rarity="combo.min">
    <div class="hr-combo__tags">
      <span
        v-for="tag in combo.tags"
        :key="tag"
        :class="['hr-tagbtn', { 'is-senior': isSenior(tag) }]"
      >
        {{ tag }}
      </span>
      <span class="hr-combo__meta">
        <template v-if="combo.unsure">未拉满 9:00，标签可能被划掉</template>
        <template v-else>
          {{ combo.ops.length }} 位 · <b>{{ range }}★</b>
        </template>
      </span>
    </div>
    <div class="hr-combo__ops">
      <OpTile v-for="op in shown" :key="op.zh" :op="op" />
      <button
        v-if="folded"
        type="button"
        class="hr-more"
        :aria-label="`展开其余 ${combo.ops.length - FOLD} 位干员`"
        @click="expanded = true"
      >
        +{{ combo.ops.length - FOLD }}
      </button>
    </div>
  </li>
</template>

<style scoped lang="scss">
@use "./mixins";

.hr-combo {
  display: grid;
  grid-template-columns: 232px minmax(0, 1fr);
  margin: 0;

  & + & {
    border-top: 1px solid var(--ak-border);
  }

  &__tags {
    display: flex;
    flex-wrap: wrap;
    align-content: flex-start;
    align-items: center;
    gap: 6px;
    padding: 12px var(--ak-space-3);
    border-left: var(--ak-bar-w) solid var(--ak-r, var(--ak-border-strong));
    border-right: 1px solid var(--ak-border-subtle);
  }

  &__meta {
    flex: 1 0 100%;
    font-size: var(--ak-fs-xs);
    color: var(--ak-fg-muted);

    b {
      font: 700 var(--ak-fs-xs) / 1 var(--ak-font-label);
      color: var(--ak-r-text);
    }
  }

  &__ops {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 6px;
    padding: 10px var(--ak-space-3);
    min-width: 0;
  }

  // 窄于 760：标签挪到干员上面，稀有度色条跟着干员往下画
  .hr--compact & {
    grid-template-columns: minmax(0, 1fr);

    &__tags {
      padding: 10px var(--ak-space-3) 0;
      border-right: 0;
    }

    &__meta {
      flex: none;
      margin-left: auto;
    }

    &__ops {
      border-left: var(--ak-bar-w) solid var(--ak-r, var(--ak-border-strong));
    }
  }

  // 保底速查排成多列的格子：标签在上、干员在下，格子里不画稀有度色条（层标题已经标了）
  .hr-combos--grid > & {
    display: flex;
    flex-direction: column;
    border-top: 0;
    box-shadow:
      1px 0 0 var(--ak-border),
      0 1px 0 var(--ak-border);
  }

  .hr-combos--grid > & &__tags {
    padding: 10px var(--ak-space-3) 0;
    border: 0;
  }

  .hr-combos--grid > & &__meta {
    flex: none;
    margin-left: auto;
  }

  .hr-combos--grid > & &__ops {
    border: 0;
  }
}

// 游戏的深灰标签钮（btn_request #313131 白字），去掉投影换成底边
.hr-tagbtn {
  display: inline-flex;
  align-items: center;
  height: 28px;
  padding: 0 10px;
  background: var(--ak-gray-800);
  color: #fff;
  font-weight: 600;
  font-size: var(--ak-fs-sm);
  line-height: 1;
  white-space: nowrap;
  box-shadow: 0 2px 0 rgba(0, 0, 0, 0.28);

  &.is-senior {
    @include mixins.senior-btn;
  }
}

.hr-more {
  all: unset;
  box-sizing: border-box;
  display: grid;
  place-items: center;
  width: 56px;
  height: 56px;
  border: 1px dashed var(--ak-border-strong);
  color: var(--ak-fg-secondary);
  font: 700 var(--ak-fs-sm) / 1 var(--ak-font-label);
  cursor: pointer;

  &:hover {
    border-color: var(--ak-accent);
    color: var(--ak-accent);
  }

  &:focus-visible {
    @include mixins.focus-ring;
  }

  .hr--narrow & {
    width: 52px;
    height: 52px;
  }
}
</style>
