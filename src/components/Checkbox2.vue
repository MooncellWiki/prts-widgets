<script lang="ts">
import { defineComponent } from 'vue'
export default defineComponent({
  name: 'Checkbox2',
  props: {
    modelValue: Boolean, noWidth: { type: Boolean, default: false },
  },
})
</script>

<template>
  <div
    :class="{
      'selected': modelValue, 'no-width': noWidth,
    }"
    class="checkbox-container"
  >
    <slot />
  </div>
</template>

<style scoped>
.checkbox-container {
  width: 100px;
  background-color: #313131;
  color: #ffffff;
  height: 28px;
  min-width: 40px;
  padding: 0 8px;
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  vertical-align: middle;
  box-shadow: 0 3px 5px grey;
  letter-spacing: 0.08em;
  text-indent: 0.08em;
  cursor: pointer;
  /* width: initial; */
}
.selected {
  background-color: #0098dc;
}
.no-width {
  width: initial;
}
</style>
