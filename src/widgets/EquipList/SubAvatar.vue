<script lang="ts">
import type { PropType } from "vue";
import { defineComponent, ref, watch } from "vue";

import { useVModel } from "@vueuse/core";

import { getImagePath } from "@/utils/utils";

import { useCharStore } from "./script/charStore";
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
    const charStore = useCharStore();
    const charRef = useVModel(props, "char", emit);
    const onClickImg = (name: string) => {
      return name;
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
      charStore,
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
    @click="charStore.addOrDeleteChar(char)"
  />
</template>
