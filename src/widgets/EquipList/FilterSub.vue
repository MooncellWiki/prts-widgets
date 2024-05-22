<script lang="ts">
import type { PropType } from "vue";
import { defineComponent } from "vue";

import { useVModel } from "@vueuse/core";
import { NSelect } from "naive-ui";

import type { SelectGroupOption, SelectOption } from "naive-ui";

export default defineComponent({
  name: "FilterSub",
  components: {
    NSelect,
  },
  props: {
    title: String,
    placeholder: String,
    options: {
      type: Array as PropType<SelectOption[] | SelectGroupOption[]>,
      default: () => [],
    },
    selected: {
      type: Array as PropType<string[]>,
      default: () => [],
      required: true,
    },
    disabled: {
      type: Boolean,
      default: false,
    },
  },
  emits: ["update:selected"],
  setup(props, { emit }) {
    const value = useVModel(props, "selected", emit);
    return {
      value,
    };
  },
});
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
        filterable
        clearable
        multiple
        :placeholder="placeholder"
      />
    </div>
  </div>
</template>

<style scoped></style>
