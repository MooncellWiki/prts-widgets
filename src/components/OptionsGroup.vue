<script setup lang="ts">
import { useVModel } from "@vueuse/core";
import { NButton } from "naive-ui";
const props = withDefaults(
  defineProps<{
    title?: string;
    options: string[];
    modelValue: string[];
    disabled?: boolean;
  }>(),
  {
    modelValue: () => [],
    disabled: false,
  },
);
const emit = defineEmits<{
  "update:modelValue": [string[]];
}>();
const selectedOptions = useVModel(props, "modelValue", emit, {
  passive: true,
  deep: true,
});
const onTagClick = (option: string) => {
  return selectedOptions.value.includes(option)
    ? selectedOptions.value.splice(selectedOptions.value.indexOf(option), 1)
    : selectedOptions.value.push(option);
};
const selectAll = () => {
  for (const option of props.options)
    if (!selectedOptions.value.includes(option))
      selectedOptions.value.push(option);
};
const selectNone = () => selectedOptions.value.splice(0);
</script>

<template>
  <div class="flex flex-row items-center justify-center">
    <span class="basis-1/8">{{ title }}</span>
    <div class="flex basis-7/8 flex-row items-center">
      <div class="flex flex-col lg:flex-row">
        <NButton class="m-1" :disabled="disabled" @click="selectAll()">
          全选
        </NButton>
        <NButton class="m-1" :disabled="disabled" @click="selectNone()">
          清除
        </NButton>
      </div>
      <div>
        <NButton
          v-for="(option, index) in options"
          :key="index"
          :disabled="disabled"
          strong
          secondary
          :type="selectedOptions.includes(option) ? 'info' : 'default'"
          class="m-1"
          @click="onTagClick(option)"
        >
          {{ option }}
        </NButton>
      </div>
    </div>
  </div>
</template>

<style scoped></style>
