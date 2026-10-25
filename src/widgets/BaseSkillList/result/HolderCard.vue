<script setup lang="ts">
import { computed } from "vue";

import { AkOpCard } from "@mooncellwiki/prts-design-vue";

import { avatar } from "@/utils/charImage";

import { eliteLarge, professionLine, rarityIcon, wikiLink } from "../assets";
import { professionName } from "../consts";

import type { Char, Holding } from "../data";

/**
 * 干员头像 = 设计系统的干员卡（同首页「亮点干员」：纯头像、不出名字栏）。
 * 角标同现网 微件:干员头像——职业左上、星级右下，技能视图的持有者另在左下压解锁条件的精英大图（游戏原图，垫黑底），
 * 「精英零 30 级」这类在图上方补等级。悬停只出卡自带的 title（干员名），同现网头像链接的 title。
 */
const props = defineProps<{
  char: Char;
  /** 技能视图的持有者：左下角出解锁条件 */
  holding?: Holding;
  /** 不符合持有者那三行筛选：压淡，不藏 */
  dim?: boolean;
  /** 卡头里的头像：名字就在旁边，不进 Tab 次序、读屏跳过、不出 title */
  decorative?: boolean;
}>();

/** AkOpCard 的 rarity / elite 是字面量类型 */
const rarity = computed(() => props.char.stars as 1 | 2 | 3 | 4 | 5 | 6);
const elite = computed(() => props.holding?.phase as 0 | 1 | 2 | undefined);
/** 精英图上方的等级：交给 ::before 的 content，所以是带引号的字符串 */
const levelStyle = computed(() =>
  props.holding && props.holding.level > 1
    ? { "--rs-lv": `"${props.holding.level}"` }
    : undefined,
);
</script>

<template>
  <AkOpCard
    :class="['rs-holder', { 'is-dim': dim }]"
    :style="levelStyle"
    :name="char.name"
    :avatar="avatar({ zh: char.name, charId: char.id })"
    :rarity="rarity"
    :rarity-icon="rarityIcon(char.stars)"
    :profession="professionName(char.profession)"
    :profession-icon="professionLine(char.profession)"
    :elite="elite"
    :elite-icon="elite === undefined ? undefined : eliteLarge(elite)"
    size="sm"
    :href="wikiLink(char.name)"
    avatar-only
    :title="decorative ? '' : char.name"
    :tabindex="decorative ? -1 : undefined"
    :aria-hidden="decorative ? 'true' : undefined"
  />
</template>

<style scoped lang="scss">
// 宽 64（现网头像 60，含 1px 框；不定 border-box 的话卡是 66，一行放不下四张），结果区窄时收到 56。
// 职业 / 精英角标 18px 黑框；星级按卡宽取比例（同现网 18% 高，收一点免得和左下的精英角标碰上）
.rs-holder.ak-op-card {
  --_w: 64px;

  flex: none;
  box-sizing: border-box;

  .rs--compact & {
    --_w: 56px;
  }

  :deep(.ak-op-card__rarity) {
    height: calc(var(--_w) * 0.16);
  }

  :deep(.ak-op-card__prof) {
    width: 18px;
    height: 18px;

    > img {
      width: 15px;
      height: 15px;
    }
  }

  // 精英大图垫设计系统那块半透明黑底（同现网垫黑、同左上职业角标），浅色立绘上也看得清；框同职业角标 18px 见方
  :deep(.ak-op-card__elite) {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1px;
    width: 18px;
    min-width: 0;
    height: auto;
    min-height: 18px;
    padding: 1px;

    > img {
      width: 100%;
      height: auto;
    }
  }

  // 等级叠在图的上方（框往上长）：放旁边的话 4★ 的星条一宽就撞上
  :deep(.ak-op-card__elite::before) {
    content: var(--rs-lv, none);
    font: 700 9px / 1 var(--ak-font-label);
    color: #fff;
    font-variant-numeric: tabular-nums;
  }

  &:focus-visible {
    outline: 2px solid var(--ak-focus);
    outline-offset: -2px;
  }

  &.is-dim {
    opacity: 0.3;

    &:hover,
    &:focus-visible {
      opacity: 1;
    }
  }
}
</style>
