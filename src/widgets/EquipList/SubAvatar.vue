<script lang="ts">
import { defineComponent, inject, ref, watch, PropType, Ref } from "vue";

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
    const onClickImg = (name: string) => {
      return name;
    };
    const selectedChar = inject("selectedChar") as Ref<Char[]>;
    const addOrDeleteChar = (char: Char) => {
      !selectedChar.value.includes(char)
        ? selectedChar.value.push(char)
        : selectedChar.value.splice(selectedChar.value.indexOf(char));
    };
    const src = ref(
      `/images/${getImagePath(`头像_${charRef.value.name}_2.png`)}`,
    );
    watch(charRef.value, () => {
      src.value = `/images/${getImagePath(`头像_${charRef.value.name}_2.png`)}`;
    });
    return {
      getImagePath,
      src,
      charRef,
      onClickImg,
      addOrDeleteChar,
    };
  },
});
</script>

<template>
  <img
    class="m-[2px] cursor-pointer"
    :src="`/images/${getImagePath(`头像_${charRef.name}_2.png`)}`"
    width="65"
    height="65"
    @click="addOrDeleteChar(charRef)"
  />
</template>
