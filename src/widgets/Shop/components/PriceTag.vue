<script setup lang="ts">
import { computed } from "vue";

import { wikiImage } from "../utils";

// 对应 模板:价格，颜色与图标宽度取自 模板:价格/样式
const CURRENCY_STYLE: Record<string, { color: string; width: number }> = {
  源石: { color: "#DFB500", width: 23 },
  高级凭证: { color: "#FDE516", width: 18 },
};

const props = defineProps<{
  currency: string;
  value: number | string;
  /** 折扣前的原价，显示为删除线 */
  origin?: number | string;
}>();

const style = computed(
  () => CURRENCY_STYLE[props.currency] ?? { color: "#FFFFFF", width: 20 },
);
</script>

<template>
  <span class="price-tag" :style="{ borderLeftColor: style.color }">
    <span class="price-tag-icon">
      <img
        :src="wikiImage(`图标_${currency}.png`)"
        :width="style.width"
        :alt="currency"
        loading="lazy"
      />
    </span>
    <span class="price-tag-value">
      <del v-if="origin !== undefined" class="price-tag-origin">{{
        origin
      }}</del
      >{{ value }}
    </span>
  </span>
</template>

<style scoped>
.price-tag {
  position: relative;
  display: inline-block;
  padding-right: 5px;
  background: #595959;
  border-left: 5px solid;
}

.price-tag-icon {
  position: absolute;
  top: 0;
  left: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 25px;
  height: 100%;
  line-height: 1;
}

.price-tag-value {
  display: inline-block;
  padding-left: 25px;
  color: #fff;
  font-weight: bold;
}

.price-tag-origin {
  margin-right: 0.3em;
  color: #bbb;
  font-weight: normal;
}
</style>
