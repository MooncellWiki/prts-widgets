<script setup lang="ts">
import OpTile from "./OpTile.vue";
import { isSenior } from "./consts";

import type { Combo } from "./recruit";

/**
 * 一组：左边是标签（游戏的深灰标签钮），右边是全部干员；左边的色条 = 保底的稀有度。
 * 保底速查里排成多列的格子：标签在上、干员在下。
 */
defineProps<{ combo: Combo }>();
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
    </div>
    <div class="hr-combo__ops">
      <OpTile v-for="op in combo.ops" :key="op.zh" :op="op" />
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
</style>
