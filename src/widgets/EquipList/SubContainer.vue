<script lang="ts">
import type { PropType, Ref } from "vue";
import { defineComponent, inject } from "vue";

import { NCard } from "naive-ui";

import { getLanguage } from "@/utils/i18n";
import { getImagePath } from "@/utils/utils";

import SubAvatar from "./SubAvatar.vue";
import { customLabel } from "./i18n";
import { Char } from "./types";

export default defineComponent({
  name: "SubContainer",
  components: {
    NCard,
    SubAvatar,
  },
  props: {
    title: {
      type: String,
      required: true,
    },
    chars: {
      type: Array as PropType<Char[]>,
      default: () => [],
    },
  },
  emits: ["update:charList"],
  setup(props) {
    const showChars = inject("showChars") as Ref<string[]>;
    const expandAll = () => {
      for (const char of props.chars) {
        if (!showChars.value.includes(char.name)) {
          showChars.value.push(char.name);
        }
      }
    };
    const collapseAll = () => {
      for (const char of props.chars) {
        if (showChars.value.includes(char.name)) {
          showChars.value.splice(
            showChars.value.findIndex((n) => n == char.name),
            1,
          );
        }
      }
    };
    return {
      getImagePath,
      expandAll,
      collapseAll,
      showChars,
      customLabel,
      locale: getLanguage(),
    };
  },
});
</script>

<template>
  <NCard
    class="m-1 w-full"
    header-style="text-align: center;"
    size="small"
    hoverable
  >
    <template #header>
      <div class="flex items-center justify-center">
        <span
          class="h-[40px] w-[40px] inline-flex items-center justify-center overflow-hidden bg-black align-text-bottom"
        >
          <img
            class="absolute scale-50"
            :src="getImagePath(`职业分支图标_${title}.png`)"
          />
        </span>
        <span class="inline-block text-center" style="width: 7em">{{
          customLabel[locale].subtypeMap[title] ?? title
        }}</span>
      </div>
    </template>
    <template #header-extra>
      <span
        class="mdi mdi-arrow-expand cursor-pointer text-xl"
        @click="expandAll()"
      />
      <span
        class="mdi mdi-arrow-collapse cursor-pointer text-xl"
        @click="collapseAll()"
      />
    </template>
    <div class="flex flex-wrap">
      <SubAvatar
        v-for="(char, ind) in chars"
        :key="ind"
        :show="showChars.includes(char.name)"
        :char="char"
      />
    </div>
  </NCard>
</template>
