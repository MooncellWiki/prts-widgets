<script setup lang="ts">
import { computed, provide } from "vue";
const props = defineProps<{
  modelValue: Record<string, boolean> | string;
  isRadio?: boolean;
}>();
const emit = defineEmits<{
  "update:modelValue": [Record<string, boolean> | string];
}>();

const stateMap = computed(() => {
  if (props.isRadio) {
    return {
      [props.modelValue as string]: true,
    };
  }
  return props.modelValue as Record<string, boolean>;
});
function setState(value: string, state: boolean) {
  if (!props.isRadio) {
    stateMap.value[value] = state;
    emit("update:modelValue", stateMap.value);
    return;
  }
  if (stateMap.value[value] && !state) return;

  if (!stateMap.value[value] && state) {
    Object.keys(stateMap.value).find((key) => {
      if (stateMap.value[key]) {
        stateMap.value[key] = false;
        return true;
      }
      return false;
    });
    stateMap.value[value] = true;
    emit("update:modelValue", value);
  }
}
provide("check-box-group", { state: stateMap, setState });
</script>

<template>
  <div>
    <slot />
  </div>
</template>
