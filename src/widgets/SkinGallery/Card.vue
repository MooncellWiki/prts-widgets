<script setup lang="ts">
import { computed, ref } from "vue";

import { halfPortrait, media, onImageError } from "@/utils/charImage";

import { galleryLink } from "./compat";

import type { GalleryCard } from "./types";

const props = defineProps<{ card: GalleryCard }>();
const transform = ref("");
const portrait = computed(() =>
  halfPortrait({
    zh: props.card.charName,
    portraitId: props.card.portraitId,
    skinIndex: props.card.skinIndex,
  }),
);
function tilt(event: PointerEvent) {
  if (
    event.pointerType !== "mouse" ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  )
    return;
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
  const x = (event.clientX - rect.left) / rect.width - 0.5;
  const y = (event.clientY - rect.top) / rect.height - 0.5;
  transform.value = `perspective(700px) rotateX(${-y * 10}deg) rotateY(${x * 10}deg) scale(1.06)`;
}
</script>

<template>
  <a
    class="sg-card"
    :href="galleryLink(card.series, card.anchor)"
    :title="`${card.charName} · ${card.skinName}`"
    :style="{ transform }"
    @pointermove="tilt"
    @pointerleave="transform = ''"
    @error.capture="onImageError"
  >
    <img
      class="sg-card-logo"
      :src="media(`Skin_brand_${card.series}.png`)"
      alt=""
      loading="lazy"
    />
    <img
      class="sg-card-portrait"
      :src="portrait"
      :alt="`${card.charName} · ${card.skinName}`"
      loading="lazy"
    />
    <span v-if="card.tag" class="sg-card-tag">{{ card.tag }}</span>
    <span class="sg-card-footer">
      <strong>{{ card.skinName }}</strong>
      <span>{{ card.charName }}</span>
      <small>{{ card.charNameEn || card.brandCapitalName }}</small>
    </span>
  </a>
</template>

<style scoped>
.sg-card {
  position: relative;
  display: block;
  width: 120px;
  height: 276px;
  color: #313131;
  background: #fff;
  box-shadow: 0 3px 8px #0004;
  transition: transform 0.2s ease;
  text-decoration: none;
}
.sg-card:hover,
.sg-card:focus-visible {
  z-index: 1;
  transform: scale(1.06);
}
.sg-card:focus-visible {
  outline: 3px solid #0098dc;
  outline-offset: 3px;
}
.sg-card-logo {
  position: absolute;
  top: 12px;
  left: 4px;
  width: 100px;
  opacity: 0.2;
  filter: invert(1);
}
.sg-card-portrait {
  position: absolute;
  inset: 0;
  width: 120px;
  height: 240px;
  object-fit: contain;
  object-position: bottom;
}
.sg-card-tag {
  position: absolute;
  top: 5px;
  right: 0;
  padding: 0 5px;
  color: #fff;
  background: #0224ff;
  font-size: 11px;
}
.sg-card-footer {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  flex-direction: column;
  padding: 5px;
  background: #fff;
  line-height: 1.3;
}
.sg-card-footer strong {
  font-size: 13px;
}
.sg-card-footer span {
  font-size: 11px;
  color: #54595d;
}
.sg-card-footer small {
  font-size: 9px;
  color: #72777d;
  overflow-wrap: anywhere;
}
@media (prefers-reduced-motion: reduce) {
  .sg-card {
    transition: none;
  }
  .sg-card:hover,
  .sg-card:focus-visible {
    transform: none;
  }
}
</style>
