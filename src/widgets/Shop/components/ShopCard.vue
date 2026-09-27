<script setup lang="ts">
// Widget:ShopList 商品卡片的 Vue 版本：上半是图标，下半是库存 / 价格信息条
withDefaults(
  defineProps<{
    background?: string;
    /** 省略时不显示库存；-1 显示为 ∞ */
    stock?: number;
    price?: number | string;
    /** 阶梯商品：信息条换成蓝色的「阶梯商品」标记 */
    progress?: boolean;
    priceColor?: string;
    width?: string;
  }>(),
  {
    background: "transparent",
    priceColor: "#f0f002",
    width: "10.5em",
  },
);
</script>

<template>
  <div class="shop-card" :style="{ width }">
    <div class="shop-card-icon" :style="{ background }">
      <slot />
    </div>
    <div
      class="shop-card-info"
      :class="{ 'shop-card-info-progress': progress }"
    >
      <div v-if="progress" class="shop-card-progress">
        <span class="shop-card-pillar h-20px" />
        <span class="shop-card-pillar h-16px opacity-76" />
        <span class="shop-card-pillar h-12px opacity-55" />
        &nbsp;阶梯商品
      </div>
      <template v-else-if="stock !== undefined">
        <div class="shop-card-stock" :class="{ 'opacity-40': stock < 0 }">
          <i class="mdi mdi-package-variant-closed" />&nbsp;{{
            stock < 0 ? "∞" : stock
          }}
        </div>
        <div class="shop-card-divider" />
      </template>
      <div v-if="price !== undefined" class="shop-card-price">
        <i class="mdi mdi-tag" />&nbsp;<span :style="{ color: priceColor }">{{
          price
        }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.shop-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin: 0 0.3em 0.3em 0;
  background: #fff;
  border: 1px solid lightgrey;
  border-radius: 3px;
  box-shadow: 0 3px 4px #0001;
  overflow: hidden;
}

.shop-card-icon {
  width: 100%;
  padding: 0.3em 0;
  text-align: center;
  line-height: 0;
}

.shop-card-info {
  display: flex;
  justify-content: space-evenly;
  width: 100%;
  background: #616161;
  color: #fff;
}

.shop-card-info-progress {
  background: #0098dc;
}

.shop-card-stock,
.shop-card-price,
.shop-card-progress {
  margin: 0.1em 0;
}

.shop-card-progress {
  display: flex;
  align-items: flex-end;
}

.shop-card-pillar {
  display: inline-block;
  width: 4px;
  padding: 0 1px;
  background: #fff;
}

.shop-card-divider {
  width: 0.1em;
  background: #fff5;
}

/* Vue 的 :global() 会把整个选择器替换成括号内的部分，暗色规则须整条写在括号里 */
:global(.prts-widget-dark .shop-card) {
  background: #202122;
  border-color: #54595d;
}
</style>
