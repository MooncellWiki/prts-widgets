<script setup lang="ts">
import { computed, ref, watch } from "vue";

import { brandSlides } from "./model";

import type { Brand, GalleryCard } from "./types";

const props = defineProps<{ brand: Brand; cards: GalleryCard[] }>();
const slides = computed(() => brandSlides(props.brand, props.cards));
const index = ref(0);
const failed = ref(false);
const current = computed(() => slides.value[index.value]);
watch(
  () => props.brand.brandId,
  () => {
    index.value = 0;
  },
);
watch(
  () => current.value?.src,
  () => {
    failed.value = false;
  },
);
function move(delta: number) {
  index.value =
    (index.value + delta + slides.value.length) % slides.value.length;
}
</script>

<template>
  <section
    class="sg-carousel"
    aria-label="品牌宣传图"
    aria-roledescription="轮播"
  >
    <div class="sg-carousel-image">
      <img
        v-if="current && !failed"
        :key="current.src"
        :src="current.src"
        :alt="current.label"
        @error="failed = true"
      />
      <p v-else role="status">宣传图暂时无法加载，请稍后重试。</p>
    </div>
    <div class="sg-carousel-controls">
      <button type="button" aria-label="上一张宣传图" @click="move(-1)">
        ‹ 上一张
      </button>
      <label
        >宣传图
        <select v-model="index">
          <option v-for="(slide, n) in slides" :key="slide.id" :value="n">
            {{ n + 1 }} / {{ slides.length }} · {{ slide.label }}
          </option>
        </select></label
      >
      <button type="button" aria-label="下一张宣传图" @click="move(1)">
        下一张 ›
      </button>
    </div>
    <div class="sg-carousel-caption" aria-live="polite">
      <a v-for="link in current?.linked" :key="link.href" :href="link.href">{{
        link.name
      }}</a>
      <span v-if="!current?.linked.length">{{ current?.label }}</span>
    </div>
  </section>
</template>

<style scoped>
.sg-carousel {
  max-width: 900px;
  margin: 0 auto 1.5rem;
}
.sg-carousel-image {
  display: grid;
  place-items: center;
  min-height: 180px;
  background: #161a21;
  color: #fff;
}
.sg-carousel-image img {
  display: block;
  width: 100%;
  height: auto;
  max-height: 560px;
  object-fit: contain;
}
.sg-carousel-controls {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  justify-content: space-between;
  margin-top: 0.6rem;
}
.sg-carousel-controls label {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  white-space: nowrap;
}
.sg-carousel-controls select {
  min-width: 0;
  width: 100%;
}
.sg-carousel-controls button {
  flex-shrink: 0;
}
button,
select {
  min-height: 34px;
  border: 1px solid #72777d;
  border-radius: 3px;
  padding: 4px 6px;
  background: var(--sg-bg);
  color: inherit;
  cursor: pointer;
  font: inherit;
}
.sg-carousel-caption {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem 1rem;
  margin-top: 0.5rem;
}
.sg-carousel-caption a {
  color: var(--sg-link, #36c);
}
@media (max-width: 480px) {
  .sg-carousel-controls {
    flex-wrap: wrap;
  }
  .sg-carousel-controls label {
    order: 1;
    flex-basis: 100%;
  }
}
</style>
