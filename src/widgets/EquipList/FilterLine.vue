<script lang="ts">
import { type PropType, defineComponent } from "vue";

import { useVModel } from "@vueuse/core";
import { NButton } from "naive-ui";

export default defineComponent({
  name: "FilterLine",
  components: {
    NButton,
  },
  props: {
    title: String,
    options: {
      type: Array as PropType<string[]>,
      required: true,
    },
    optionValue: {
      type: Array as PropType<string[]>,
      default: () => [],
    },
  },
  emits: ["update:OptionValue"],
  setup(props, { emit }) {
    const optionValue = useVModel(props, "optionValue", emit);
    const selectAll = () => {
      props.options.forEach((option) => {
        if (!optionValue.value.includes(option)) optionValue.value.push(option);
      });
    };
    const cancelAll = () => {
      optionValue.value.splice(0);
    };
    const onTagClick = (option: string) => {
      if (optionValue.value.includes(option))
        optionValue.value.splice(optionValue.value.indexOf(option), 1);
      else optionValue.value.push(option);
    };
    return {
      optionValue,
      selectAll,
      cancelAll,
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
        <NButton class="m-1" @click="cancelAll()"> 清除 </NButton>
      </div>
      <div>
        <NButton
          v-for="(option, index) in options"
          :key="index"
          strong
          secondary
          :type="optionValue.includes(option) ? 'info' : 'default'"
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
