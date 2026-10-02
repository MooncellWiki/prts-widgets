<script setup lang="ts">
import { computed } from "vue";

import { avatar, onImageError } from "@/utils/charImage";

import { wikiLink } from "./assets";

import type { Op } from "./recruit";

/**
 * 干员：头像 + 稀有度色条 + 名字，整块链到干员页；悬停 / 聚焦出提示（星级、全部标签，气泡由根组件画）。
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
    <span class="hr-op__img">
      <img
        :src="avatar(op)"
        alt=""
        width="56"
        height="56"
        loading="lazy"
        decoding="async"
        @error="onImageError"
      />
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

.hr-op {
  position: relative;
  display: flex;
  flex-direction: column;
  width: 56px;
  text-decoration: none;
  color: var(--ak-fg);

  &:visited,
  &:active,
  &:hover {
    color: var(--ak-fg);
    text-decoration: none;
  }

  &__img {
    display: block;
    width: 56px;
    height: 56px;
    box-sizing: border-box;
    background: #1d1f20 linear-gradient(180deg, #2b2d2f, #141516);
    border-bottom: 3px solid var(--ak-r, var(--ak-border-strong));
    overflow: hidden;

    > img {
      display: block;
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
  }

  &__name {
    padding-top: 3px;
    font-size: max(11px, var(--ak-fs-cjk-min));
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

  .hr--narrow & {
    width: 52px;

    &__img {
      width: 52px;
      height: 52px;
    }
  }
}
</style>
