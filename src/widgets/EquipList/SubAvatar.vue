<script lang="ts">
import type { PropType, Ref } from "vue";
import { defineComponent, inject, ref, watch } from "vue";

import { useVModel } from "@vueuse/core";

import { getImagePath } from "@/utils/utils";

import type { Char } from "./types";

export default defineComponent({
  name: "SubAvatar",
  props: {
    char: {
      type: Object as PropType<Char>,
      required: true,
    },
  },
  emits: ["update:char"],
  setup(props, { emit }) {
    const charRef = useVModel(props, "char", emit);
    const selectedChar = inject("selectedChar") as Ref<Char[]>;
    const addOrDeleteChar = (char: Char) => {
      selectedChar.value.includes(char)
        ? selectedChar.value.splice(selectedChar.value.indexOf(char))
        : selectedChar.value.push(char);
    };
    const getBackdrop = (char: Char) => {
      return selectedChar.value.includes(char) ? "invert(25%)" : "";
    };
    const src = ref(getImagePath(`头像_${charRef.value.name}_2.png`));
    watch(charRef.value, () => {
      src.value = getImagePath(`头像_${charRef.value.name}_2.png`);
    });
    return {
      getImagePath,
      src,
      charRef,
      getBackdrop,
      addOrDeleteChar,
    };
  },
});
</script>

<template>
  <img
    class="m-[2px] cursor-pointer"
    :src="getImagePath(`头像_${charRef.name}_2.png`)"
    width="65"
    height="65"
    :style="{
      backdropFilter: getBackdrop(charRef),
    }"
    @click="addOrDeleteChar(charRef)"
  />
</template>
