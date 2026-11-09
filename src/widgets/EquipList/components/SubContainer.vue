<script setup lang="ts">
import { NCard } from "naive-ui";

import { getLanguage } from "@/utils/i18n";
import { getImagePath } from "@/utils/utils";

import { useEquipListStore } from "../store";

import SubAvatar from "./SubAvatar.vue";

import type { CharEquips } from "../types";

const props = withDefaults(
  defineProps<{
    title: string;
    chars?: CharEquips[];
    groupby?: string;
  }>(),
  {
    chars: () => [],
    groupby: () => "sub",
  },
);

const store = useEquipListStore();
const locale = getLanguage();
</script>

<template>
  <NCard
    class="my-1 w-full"
    header-style="text-align: center; padding: 10px;"
    content-style="padding: 6px"
    size="small"
    hoverable
  >
    <template #header>
      <div v-if="groupby === 'sub'" class="flex items-center justify-center">
        <span
          class="h-[40px] w-[40px] inline-flex items-center justify-center overflow-hidden bg-black align-text-bottom"
        >
          <img
            class="absolute scale-50"
            :src="getImagePath(`职业分支图标_${title}.png`)"
          />
        </span>
        <span class="inline-block text-center" style="width: 7em">
          {{ title }}
        </span>
      </div>
      <div v-if="groupby === 'time'">
        {{ new Date(Number(title) * 1000).toLocaleDateString(locale) }}
      </div>
      <div v-if="groupby === 'opt'">
        <a :href="`/w/${title}`">
          {{ title }}
        </a>
      </div>
    </template>
    <template #header-extra>
      <span
        class="mdi mdi-arrow-expand cursor-pointer p-0.5 text-xl"
        @click="store.expand(chars)"
      />
      <span
        class="mdi mdi-arrow-collapse cursor-pointer p-0.5 text-xl"
        @click="store.collapse(chars)"
      />
    </template>
    <div class="flex flex-wrap">
      <SubAvatar
        v-for="(char, ind) in chars"
        :key="ind"
        :show="store.isShown(char)"
        :char="char"
      />
    </div>
  </NCard>
</template>
