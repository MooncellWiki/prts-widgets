<script lang="ts">
import { defineComponent } from 'vue'

export default defineComponent({
  props: {
    label: String,
  },
})
</script>

<template>
  <div>
    <label class="mb-1">{{ label }}</label>
    <slot />
  </div>
</template>
