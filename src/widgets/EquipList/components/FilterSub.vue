<script setup lang="ts">
import { useVModel } from "@vueuse/core";
import { NSelect, type SelectGroupOption, type SelectOption } from "naive-ui";

const props = withDefaults(
  defineProps<{
    title?: string;
    placeholder?: string;
    options?: SelectOption[] | SelectGroupOption[];
    selected: string[];
    disabled?: boolean;
  }>(),
  {
    options: () => [],
    disabled: false,
  },
);
const emit = defineEmits<{
  "update:selected": [string[]];
}>();
const value = useVModel(props, "selected", emit);
</script>

<template>
  <div class="flex flex-row items-center justify-center">
    <span class="basis-1/8">{{ title }}</span>
    <div class="flex basis-7/8 flex-row items-center">
      <NSelect
        v-model:value="value"
        class="m-1"
        :disabled="disabled"
        :options="options"
        :fallback-option="false"
        filterable
        clearable
        multiple
        :placeholder="placeholder"
      />
    </div>
  </div>
</template>

<style scoped></style>
