<script setup lang="ts">
import { computed } from "vue";

import { useQuery } from "@pinia/colada";

import { useTheme } from "@/utils/theme";

import PriceTag from "./components/PriceTag.vue";
import SkinPortrait from "./components/SkinPortrait.vue";
import { skinGalleryQuery, skinShopQuery } from "./data";
import { formatCstTime } from "./utils";

const { isDark } = useTheme();

const nowSeconds = Date.now() / 1000;
const { data: shop, error } = useQuery(skinShopQuery);
// 时装回廊只用来配半身像，拿不到时退化成占位图，不影响商店本身；等它有了结果再一起出，半身像不用先占位再换
const { data: gallery, status: galleryStatus } = useQuery(skinGalleryQuery);

const goods = computed(() =>
  galleryStatus.value === "pending" ? undefined : shop.value?.goods,
);
</script>

<template>
  <div class="skin-shop" :class="{ 'prts-widget-dark': isDark }">
    <div v-if="error" class="skin-shop-status">
      时装商店数据加载失败：{{ error.message }}
    </div>
    <div v-else-if="!goods" class="skin-shop-status">正在加载时装商店…</div>
    <div v-else-if="goods.length === 0" class="skin-shop-status">
      时装商店当前没有在售时装
    </div>
    <div v-else class="skin-shop-list">
      <div v-for="good in goods" :key="good.goodId" class="skin-shop-item">
        <SkinPortrait
          :skin-name="good.skinName.trim()"
          :entry="gallery?.get(good.skinName.trim())"
        />
        <PriceTag
          currency="源石"
          :value="good.price"
          :origin="good.originPrice > good.price ? good.originPrice : undefined"
        />
        <div class="skin-shop-time">
          <span
            v-if="good.startDateTime > nowSeconds"
            class="skin-shop-upcoming"
          >
            即将上架
          </span>
          <div>开始 {{ formatCstTime(good.startDateTime) }}</div>
          <div>结束 {{ formatCstTime(good.endDateTime) || "—" }}</div>
        </div>
      </div>
    </div>
    <div v-if="goods && shop?.updatedAt" class="skin-shop-updated">
      商店数据更新于 {{ formatCstTime(shop.updatedAt.getTime() / 1000) }}
    </div>
  </div>
</template>

<style scoped>
.skin-shop-list {
  display: flex;
  flex-wrap: wrap;
  gap: 1em 0.8em;
}

.skin-shop-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.4em;
  min-width: 120px;
}

.skin-shop-time {
  color: #54595d;
  font-size: 12px;
  line-height: 1.4;
  text-align: center;
  white-space: nowrap;
}

.skin-shop-upcoming {
  padding: 0 4px;
  background: #0098dc;
  color: #fff;
}

.skin-shop-status,
.skin-shop-updated {
  color: #72777d;
  font-size: 0.9em;
}

.skin-shop-updated {
  margin-top: 0.6em;
}

:global(.prts-widget-dark .skin-shop-time),
:global(.prts-widget-dark .skin-shop-status),
:global(.prts-widget-dark .skin-shop-updated) {
  color: #a2a9b1;
}
</style>
