<script lang="ts">
import type { Ref } from 'vue'
import { computed, defineComponent, inject } from 'vue'
export default defineComponent({
  name: 'Checkbox2',
  props: {
    modelValue: Boolean,
    noWidth: { type: Boolean, default: false },
    value: String,
  },
  emits: ['update:modelValue'],
  setup(props, { emit }) {
    const group = inject<{ state: Ref<Record<string, boolean>>; setState: (value: string, state: boolean) => void } | null>('check-box-group', null)
    const isSelected = computed({
      get() {
        if (props.value && group)
          return group.state.value[props.value]
        if (typeof props.modelValue === 'boolean')
          return props.modelValue
        return false
      },
      set() {
        if (props.value && group)
          group.setState(props.value, !isSelected.value)
        if (typeof props.modelValue === 'boolean')
          emit('update:modelValue', !isSelected.value)
      },
    })
    return { isSelected }
  },
})
</script>

<template>
  <div
    :class="{
      'selected': isSelected, 'no-width': noWidth,
    }"
    class="checkbox-container"
    @click="() => { isSelected = !isSelected }"
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
