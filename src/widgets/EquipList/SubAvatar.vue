<script lang="ts">
import type { PropType, Ref } from "vue";
import { defineComponent, inject } from "vue";

import { useVModel } from "@vueuse/core";

import { getLanguage, LANGUAGES } from "@/utils/i18n";
import { getImagePath } from "@/utils/utils";

import Equip from "./Equip.vue";

import type { CharEquips } from "./types";

export default defineComponent({
  name: "SubAvatar",
  components: {
    Equip,
  },
  props: {
    char: {
      type: Object as PropType<CharEquips>,
      required: true,
    },
    show: {
      type: Boolean,
      default: false,
    },
  },
  emits: ["update:show"],
  setup(props, { emit }) {
    const showInfo = useVModel(props, "show", emit);
    const showChars = inject("showChars") as Ref<string[]>;
    const toggleShow = async (c: CharEquips) => {
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
    return {
      getImagePath,
      toggleShow,
      showInfo,
      showChars,
      LANGUAGES,
      locale: getLanguage(),
    };
  },
});
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
      <div v-if="showInfo" class="flex items-center justify-center w-full">
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
