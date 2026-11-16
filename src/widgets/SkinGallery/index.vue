<script setup lang="ts">
import { computed, ref } from "vue";

import { useQuery } from "@pinia/colada";

import { media, onImageError } from "@/utils/charImage";
import { useTheme } from "@/utils/theme";

import Card from "./Card.vue";
import Carousel from "./Carousel.vue";
import { galleryQuery } from "./data";
import { findBrand, wikiBrandName } from "./model";

const props = withDefaults(defineProps<{ brand?: string; mode?: string }>(), {
  brand: "",
  mode: "gallery",
});
const { isDark } = useTheme();
const { data, error, refetch } = useQuery(galleryQuery);
const selected = ref("");
const brands = computed(() =>
  Object.values(data.value?.table.brandList || {}).sort(
    (a, b) => b.sortId - a.sortId,
  ),
);
const brand = computed(() =>
  data.value
    ? findBrand(data.value.table, props.brand || selected.value)
    : undefined,
);
const groups = computed(() => {
  const groups = new Map<string, NonNullable<typeof data.value>["cards"]>();
  for (const card of data.value?.cards || []) {
    if (brand.value && card.brandId !== brand.value.brandId) continue;
    groups.set(card.period, [...(groups.get(card.period) || []), card]);
  }
  return [...groups].map(([period, cards]) => ({ period, cards }));
});
</script>

<template>
  <div class="skin-gallery-v2" :class="{ 'sg-dark': isDark }">
    <div v-if="error" role="alert">
      时装回廊加载失败：{{ error.message }}
      <button type="button" @click="refetch()">重试</button>
    </div>
    <p v-else-if="!data" role="status">正在加载时装回廊…</p>
    <p v-else-if="props.brand && !brand" role="alert">
      未找到时装品牌：{{ props.brand }}
    </p>
    <template v-else>
      <nav v-if="!props.brand" class="sg-brands" aria-label="筛选时装品牌">
        <button type="button" :aria-pressed="!selected" @click="selected = ''">
          全部品牌
        </button>
        <button
          v-for="item in brands"
          :key="item.brandId"
          type="button"
          :aria-pressed="selected === item.brandId"
          @click="selected = item.brandId"
        >
          <img
            :src="media(`Skin_brand_${wikiBrandName(item.brandName)}.png`)"
            alt=""
            loading="lazy"
            @error="onImageError"
          />
          {{ wikiBrandName(item.brandName) }}
        </button>
      </nav>
      <template v-if="brand">
        <header class="sg-brand-info">
          <h2>{{ wikiBrandName(brand.brandName) }}</h2>
          <p class="sg-brand-capital">{{ brand.brandCapitalName }}</p>
          <p class="sg-brand-description">{{ brand.description }}</p>
        </header>
        <Carousel :key="brand.brandId" :brand="brand" :cards="data.cards" />
      </template>
      <template v-if="mode !== 'carousel'">
        <section v-for="group in groups" :key="group.period" class="sg-period">
          <h3 :id="group.period.replaceAll(' ', '_')">{{ group.period }}</h3>
          <div class="sg-grid">
            <Card v-for="card in group.cards" :key="card.id" :card="card" />
          </div>
        </section>
        <p v-if="!groups.length">暂无时装</p>
      </template>
    </template>
  </div>
</template>

<style scoped>
.skin-gallery-v2 {
  --sg-bg: #fff;
  --sg-link: #36c;
  color: #202122;
  background: var(--sg-bg);
  padding: 8px;
}
.sg-dark {
  --sg-bg: #202124;
  --sg-link: #8ab4f8;
  color: #eaecf0;
}
.sg-brands {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 1.5rem;
}
.sg-brands button {
  display: flex;
  align-items: center;
  gap: 5px;
  min-height: 40px;
  border: 1px solid #72777d;
  border-radius: 3px;
  padding: 6px 10px;
  color: inherit;
  background: var(--sg-bg);
  cursor: pointer;
  font: inherit;
}
.sg-brands button[aria-pressed="true"] {
  border-color: #0098dc;
  background: #0098dc;
  color: #fff;
}
.sg-brands img {
  width: 40px;
  height: 24px;
  object-fit: contain;
  background: #313131;
}
.sg-brand-info {
  max-width: 900px;
  margin: 0 auto 1rem;
}
.sg-brand-info h2 {
  margin: 0;
}
.sg-brand-capital {
  letter-spacing: 0.12em;
}
.sg-brand-description {
  white-space: pre-line;
}
.sg-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, 120px);
  gap: 18px 14px;
  padding: 8px 0 18px;
}
.sg-period h3 {
  margin: 1rem 0 0.5rem;
}
</style>
