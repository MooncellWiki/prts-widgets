<script lang="ts">
import type { PropType } from "vue";
import { defineComponent } from "vue";

import { NCard } from "naive-ui";

import { getImagePath } from "@/utils/utils";

import SubAvatar from "./SubAvatar.vue";
import { Char } from "./types";

export default defineComponent({
  name: "SubContainer",
  components: {
    NCard,
    SubAvatar,
  },
  props: {
    title: String,
    chars: {
      type: Array as PropType<Char[]>,
      default: () => [],
    },
  },
  setup() {
    return {
      getImagePath,
    };
  },
});
</script>

<template>
  <NCard
    class="w-full lg:w-[calc(50%-0.5rem)] m-1"
    header-style="text-align: center;"
    size="small"
    hoverable
  >
    <template #header>
      <div class="flex items-center justify-center">
        <span
          class="inline-flex w-[40px] h-[40px] align-text-bottom overflow-hidden justify-center items-center bg-black"
        >
          <img
            class="absolute scale-50"
            :src="`/images/${getImagePath(`职业分支图标_${title}.png`)}`"
          />
        </span>
        <span class="text-center inline-block" style="width: 6em">{{
          title
        }}</span>
      </div>
    </template>
    <SubAvatar v-for="(char, ind) in chars" :key="ind" :char="char" />
  </NCard>
</template>
