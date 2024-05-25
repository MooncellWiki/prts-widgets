<script lang="ts" setup>
defineProps<{
  label: string;
}>();
</script>

<template>
  <div>
    <label class="mb-1">{{ label }}</label>
    <slot />
  </div>
</template>
