<script lang="ts">
import type { PropType, Ref } from "vue";
import { defineComponent, inject, ref } from "vue";

import { useVModel } from "@vueuse/core";

import { getImagePath } from "@/utils/utils";

import Equip from "./Equip.vue";
import { getEquipData } from "./equipData";
import type { Char } from "./types";

export default defineComponent({
  name: "SubAvatar",
  components: {
    Equip,
  },
  props: {
    char: {
      type: Object as PropType<Char>,
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
      equipRef.value = await getEquipData(props.char.name);
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
    };
  },
});
</script>

<template>
  <div class="flex flex-col" :style="{ width: showInfo ? '100%' : 'auto' }">
    <div class="flex">
      <img
        class="m-[2px] cursor-pointer"
        :src="getImagePath(`头像_${charRef.name}_2.png`)"
        width="60"
        height="60"
        @click="
          async () => {
            if (showChars.includes(char.name)) {
              showInfo = false;
              showChars.splice(
                showChars.findIndex((c) => c == char.name),
                1,
              );
            } else {
              loading = true;
              await getCharEquip();
              showInfo = true;
              showChars.push(char.name);
              loading = false;
            }
          }
        "
      />
      <div v-if="showInfo" class="flex items-center justify-center w-full">
        <span class="font-bold">{{ char.name }}</span>
      </div>
    </div>
    <div v-if="showInfo" class="w-full">
      <Equip :name="char.name"></Equip>
    </div>
  </div>
</template>
