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
    header-style="text-align:center;"
    size="small"
    hoverable
  >
    <template #header>
      <div class="display-flex flex-items-center flex-justify-center">
        <span
          class="inline-flex w-[40px] h-[40px] vertical-text-bottom overflow-hidden justify-center flex-items-center bg-black"
        >
          <img
            :src="`/images/${getImagePath(`职业分支图标_${title}.png`)}`"
            style="position: absolute; transform: scale(0.5)"
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
