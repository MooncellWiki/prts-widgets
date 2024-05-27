<script setup lang="ts">
import type { Ref } from "vue";
import { inject } from "vue";

import { useVModel } from "@vueuse/core";

import { getLanguage, LANGUAGES } from "@/utils/i18n";
import { getImagePath } from "@/utils/utils";

import Equip from "./Equip.vue";

import type { CharEquips } from "./types";
const props = withDefaults(
  defineProps<{
    char: CharEquips;
    show?: boolean;
  }>(),
  {
    show: false,
  },
);
const emit = defineEmits<{
  "update:show": [boolean];
}>();

const showInfo = useVModel(props, "show", emit);
const showChars = inject("showChars") as Ref<string[]>;
const toggleShow = (c: CharEquips) => {
  if (showChars.value.includes(c.char.name)) {
    showInfo.value = false;
    showChars.value.splice(
      showChars.value.findIndex((n) => n == c.char.name),
      1,
    );
  } else {
    showInfo.value = true;
    showChars.value.push(c.char.name);
  }
};
const locale = getLanguage();
</script>

<template>
  <div class="flex flex-col" :style="{ width: showInfo ? '100%' : 'auto' }">
    <div class="flex">
      <img
        class="m-[2px] cursor-pointer"
        :src="getImagePath(`头像_${char.char.name}_2.png`)"
        width="60"
        height="60"
        @click="toggleShow(char)"
      />
      <div v-if="showInfo" class="w-full flex items-center justify-center">
        <span v-if="locale == LANGUAGES.JA" class="font-bold">
          {{ char.char.nameJP ?? char.char.name }}
        </span>
        <span
          v-else-if="locale == LANGUAGES.EN || locale == LANGUAGES.KO"
          class="font-bold"
        >
          {{ char.char.nameEN ?? char.char.name }}
        </span>
        <span v-else class="font-bold">{{ char.char.name }}</span>
      </div>
    </div>
    <div v-if="showInfo" class="w-full">
      <Equip :name="char.char.name" :data="char.equips"></Equip>
    </div>
  </div>
</template>
