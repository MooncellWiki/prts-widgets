<script setup lang="ts">
import { computed } from "vue";

import { avatar, onImageError } from "@/utils/charImage";

import { professionBadge, rarityStars, wikiLink } from "./assets";

import type { Op } from "./recruit";

/**
 * 干员：头像 + 名字，整块链到干员页；悬停 / 聚焦出提示（星级、全部标签，气泡由根组件画）。
 * 头像垫稀有度色的渐变底（同旧版）：一组里混着几种星级时扫一眼底色就能分开。
 * 底就是 .ak-r-avatar（画法照抽卡模拟器，干员卡 / 干员一览的头像同一套）。
 * 头像同首页的干员卡（AkOpCard）：左上角黄色星级、左下角职业图标，按这里的小头像等比缩小。
 * 只能通过公开招募获得的右上角一枚「限」（现网的绿色「限」字）。
 */
const props = defineProps<{ op: Op }>();

const tip = computed(() => {
  const { star, zh, only, tags } = props.op;
  return `${star}★ ${zh}${only ? "（只能通过公开招募获得）" : ""}\n${tags.join(" · ")}`;
});
</script>

<template>
  <a
    class="hr-op"
    :href="wikiLink(op.zh)"
    :data-rarity="op.star"
    :data-tip="tip"
  >
    <span class="hr-op__img ak-r-avatar" @error.capture="onImageError">
      <img
        class="hr-op__avatar"
        :src="avatar(op)"
        alt=""
        width="64"
        height="64"
        loading="lazy"
        decoding="async"
      />
      <img
        class="hr-op__stars"
        :src="rarityStars(op.star)"
        alt=""
        loading="lazy"
        decoding="async"
      />
      <span class="hr-op__prof">
        <img
          :src="professionBadge(op.profession)"
          alt=""
          width="17"
          height="17"
          loading="lazy"
          decoding="async"
        />
      </span>
    </span>
    <span v-if="op.only" class="hr-op__only" aria-hidden="true">限</span>
    <span class="hr-op__name">
      {{ op.zh
      }}<span v-if="op.only" class="ak-sr-only">（只能通过公开招募获得）</span>
    </span>
  </a>
</template>

<style scoped lang="scss">
@use "./mixins";

// 筛选结果里大一号（64px 头像、13px 名字）；保底速查的格子与手机排布小一号（56px），一屏多放几组
.hr-op {
  --_size: 64px;
  --_stars: 13px;
  --_prof: 20px;
  --_prof-img: 17px;
  --_name: 13px;

  position: relative;
  display: flex;
  flex-direction: column;
  width: var(--_size);
  text-decoration: none;
  color: var(--ak-fg);

  .hr-combos--grid &,
  .hr--narrow & {
    --_size: 56px;
    --_stars: 12px;
    --_prof: 18px;
    --_prof-img: 15px;
    --_name: max(11px, var(--ak-fs-cjk-min));
  }

  &:visited,
  &:active,
  &:hover {
    color: var(--ak-fg);
    text-decoration: none;
  }

  &__img {
    position: relative;
    display: block;
    width: var(--_size);
    height: var(--_size);
    // 底色来自 .ak-r-avatar
    overflow: hidden;
  }

  &__avatar {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  // 首页干员卡 88px 头像上星级 14px 高、职业图标 22px 底框，这里按头像缩小；
  // 星级比等比略大（五星不压右上角的「限」）；垫半透明黑底（同职业图标），黄星压在 5★ 金、2★ 黄绿的底色上也看得清
  &__stars {
    position: absolute;
    left: 0;
    top: 0;
    box-sizing: content-box;
    width: auto;
    height: var(--_stars);
    padding: 1px;
    background: rgba(0, 0, 0, 0.6);
  }

  &__prof {
    position: absolute;
    left: 2px;
    bottom: 2px;
    display: grid;
    place-items: center;
    width: var(--_prof);
    height: var(--_prof);
    background: rgba(0, 0, 0, 0.6);

    > img {
      display: block;
      width: var(--_prof-img);
      height: var(--_prof-img);
    }
  }

  // 左右各借半个列间距（3px），五个字的名字（正义骑士号）不折行
  &__name {
    margin: 0 -3px;
    padding-top: 3px;
    font-size: var(--_name);
    line-height: 1.25;
    text-align: center;
    overflow-wrap: anywhere;
    color: var(--ak-fg-secondary);
  }

  &:hover &__img {
    outline: 2px solid var(--ak-accent);
    outline-offset: -2px;
  }

  &:hover &__name {
    color: var(--ak-accent);
  }

  &:focus-visible {
    @include mixins.focus-ring;
  }

  &__only {
    @include mixins.only-badge;

    position: absolute;
    right: 0;
    top: 0;
  }
}
</style>
