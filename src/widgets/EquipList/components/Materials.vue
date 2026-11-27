<script setup lang="ts">
import { computed } from "vue";

import { AkItem } from "@mooncellwiki/prts-design-vue";

import { parseMaterials } from "../utils";

const props = defineProps<{ html: string }>();
const items = computed(() => parseMaterials(props.html));
</script>

<template>
  <span v-if="items.length" class="equip-materials">
    <AkItem
      v-for="(item, index) in items"
      :key="`${item.name}-${index}`"
      :src="item.src"
      :name="item.name"
      :count="item.count"
      :href="item.href"
      class="items"
    />
  </span>
</template>

<style scoped lang="scss">
.equip-materials {
  display: contents;

  :deep(.ak-item) {
    --_s: 50px;
  }

  :deep(.ak-item__count) {
    bottom: 2px;
    font-size: calc(var(--_s) * 0.32);
  }
}
</style>
