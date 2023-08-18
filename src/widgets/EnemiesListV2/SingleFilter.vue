<script lang="ts">
import { type PropType, defineComponent } from "vue";

import { useVModel } from "@vueuse/core";
import { NButton } from "naive-ui";

export default defineComponent({
  name: "SingleFilter",
  components: { NButton },
  props: {
    title: String,
    options: { type: Array as PropType<string[]>, required: true },
    modelValue: { type: Array as PropType<string[]>, default: () => [] },
  },
  emits: ["update:modelValue"],
  setup(props, { emit }) {
    const selected = useVModel(props, "modelValue", emit, {
      passive: true,
      deep: true,
    });
    const onTagClick = (option: string) => {
      return selected.value.includes(option)
        ? selected.value.splice(selected.value.indexOf(option), 1)
        : selected.value.push(option);
    };
    const selectAll = () =>
      props.options.forEach(
        (option) =>
          !selected.value.includes(option) && selected.value.push(option),
      );
    const selectNone = () => selected.value.splice(0);
    return {
      selected,
      selectAll,
      selectNone,
      onTagClick,
    };
  },
});
</script>

<template>
  <div class="flex flex-row justify-center items-center">
    <span class="basis-1/8">{{ title }}</span>
    <div class="flex flex-row items-center basis-7/8">
      <div class="flex flex-col lg:flex-row">
        <NButton class="m-1" @click="selectAll()"> 全选 </NButton>
        <NButton class="m-1" @click="selectNone()"> 清除 </NButton>
      </div>
      <div>
        <NButton
          v-for="(option, index) in options"
          :key="index"
          strong
          secondary
          :type="selected.includes(option) ? 'info' : 'default'"
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
