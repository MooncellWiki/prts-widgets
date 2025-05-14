<script setup lang="ts">
import { ref, watch } from "vue";

import { NSpin } from "naive-ui";

const props = defineProps<{
  class?: any;
  src: string;
  alt?: string;
  fallback?: string;
}>();

const isLoading = ref(true);

const handleLoad = () => {
  isLoading.value = false;
};

watch(
  () => props.src,
  () => {
    isLoading.value = true;
  },
  { immediate: true },
);
</script>

<template>
  <NSpin :show="isLoading" size="large">
    <img
      :class="props.class"
      :src="props.src"
      :alt="props.alt"
      :fallback="props.fallback"
      @load="handleLoad"
    />
  </NSpin>
</template>

<style scoped></style>
