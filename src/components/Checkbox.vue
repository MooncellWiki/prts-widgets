<script setup lang="ts">
import { computed, inject, type Ref } from "vue";

const props = withDefaults(
  defineProps<{
    modelValue?: boolean;
    noWidth?: boolean;
    value?: string;
  }>(),
  {
    noWidth: false,
  },
);
const emit = defineEmits<{
  "update:modelValue": [boolean];
}>();

const group = inject<{
  state: Ref<Record<string, boolean>>;
  setState: (value: string, state: boolean) => void;
} | null>("check-box-group", null);
const isSelected = computed({
  get() {
    if (props.value && group) return group.state.value[props.value];
    if (typeof props.modelValue === "boolean") return props.modelValue;
    return false;
  },
  set() {
    if (props.value && group) group.setState(props.value, !isSelected.value);
    if (typeof props.modelValue === "boolean")
      emit("update:modelValue", !isSelected.value);
  },
});
</script>

<template>
  <div
    :class="{
      selected: isSelected,
      'no-width': noWidth,
    }"
    class="checkbox-container"
    @click="
      () => {
        isSelected = !isSelected;
      }
    "
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
