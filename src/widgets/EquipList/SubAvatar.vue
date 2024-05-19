<script lang="ts">
import type { PropType, Ref } from "vue";
import { defineComponent, inject, ref } from "vue";

import { useVModel } from "@vueuse/core";

import { getLanguage, LANGUAGES } from "@/utils/i18n";
import { getImagePath } from "@/utils/utils";

import Equip from "./Equip.vue";
import { getEquipData } from "./equipData";

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
  emits: ["update:char", "update:show"],
  setup(props, { emit }) {
    const charRef = useVModel(props, "char", emit);
    const showInfo = useVModel(props, "show", emit);
    const showChars = inject("showChars") as Ref<string[]>;
    const equipRef = ref<DOMStringMap[]>([]);
    const getCharEquip = async () => {
      equipRef.value = await getEquipData(props.char.char.name);
    };
    const loading = ref(false);
    const showEquipList = ref<string[]>([]);
    return {
      getImagePath,
      charRef,
      showInfo,
      showChars,
      showEquipList,
      getCharEquip,
      loading,
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
        :src="getImagePath(`头像_${charRef.char.name}_2.png`)"
        width="60"
        height="60"
        @click="
          async () => {
            if (showChars.includes(char.char.name)) {
              showInfo = false;
              showChars.splice(
                showChars.findIndex((c) => c == char.char.name),
                1,
              );
            } else {
              loading = true;
              await getCharEquip();
              showInfo = true;
              showChars.push(char.char.name);
              loading = false;
            }
          }
        "
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
