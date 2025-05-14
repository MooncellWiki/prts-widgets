<script setup lang="ts">
import { ref, watch } from "vue";

import { NAlert, NSpin } from "naive-ui";

const props = defineProps<{
  class?: any;
  src: string;
  alt?: string;
  fallback?: string;
}>();

const isLoading = ref(true);
const hasError = ref(false);

const handleLoad = () => {
  isLoading.value = false;
  hasError.value = false;
};

const handleError = () => {
  isLoading.value = false;
  hasError.value = true;
};

watch(
  () => props.src,
  () => {
    isLoading.value = true;
    hasError.value = false;
  },
  { immediate: true },
);
</script>

<template>
  <div class="image-loading">
    <NSpin :show="isLoading" size="large">
      <img
        :class="props.class"
        :src="props.src"
        :alt="props.alt"
        :fallback="props.fallback"
        @load="handleLoad"
        @error="handleError"
      />
    </NSpin>
    <n-alert
      v-if="hasError"
      type="error"
      title="Error"
      description="Failed to load image."
      class="error-alert"
    />
  </div>
</template>

<style scoped>
.image-loading {
  position: relative;
  display: inline-block;
  height: 100%;
  text-align: center;
}

.error-alert {
  margin-top: 10px;
}
</style>
