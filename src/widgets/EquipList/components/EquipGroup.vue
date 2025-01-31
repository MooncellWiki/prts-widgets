<script setup lang="ts">
import { computed } from "vue";

import { NEmpty } from "naive-ui";

import { getLanguage } from "@/utils/i18n";

import { customLabel } from "../i18n";
import { CharEquips } from "../types";

import SubContainer from "./SubContainer.vue";

const props = defineProps<{
  group: string;
  data: CharEquips[];
}>();
const groupedEquipData = computed<Record<string, CharEquips[]>>(() => {
  const result: Record<string, CharEquips[]> = {};
  const term = props.group;
  switch (term) {
    case "time": {
      for (const charEquip of props.data) {
        for (const equip of charEquip.equips) {
          const { addtime } = equip;
          if (!addtime) continue;

          if (!result[addtime]) {
            result[addtime] = [];
          }
          const index = result[addtime].findIndex((e) => {
            return e.char.id === charEquip.char.id;
          });

          if (index === -1) {
            result[addtime].push({
              char: charEquip.char,
              equips: [equip],
            });
          } else {
            result[addtime][index].equips.push(equip);
          }
        }
      }
      break;
    }
    case "opt": {
      for (const charEquip of props.data) {
        for (const equip of charEquip.equips) {
          const { mission2opt = "unknown" } = equip;

          if (!result[mission2opt]) {
            result[mission2opt] = [];
          }
          const index = result[mission2opt].findIndex((e) => {
            return e.char.id === charEquip.char.id;
          });
          if (index === -1) {
            result[mission2opt].push({
              char: charEquip.char,
              equips: [equip],
            });
          } else {
            result[mission2opt][index].equips.push(equip);
          }
        }
      }
      break;
    }
    default: {
      for (const charEquip of props.data) {
        if (!result[charEquip.char.subtype]) {
          result[charEquip.char.subtype] = [];
        }
        result[charEquip.char.subtype].push(charEquip);
      }
    }
  }
  for (const key of Object.keys(result)) {
    result[key].sort((a, b) => {
      return a.char.rarity === b.char.rarity
        ? b.char.id - a.char.id
        : Number.parseInt(b.char.rarity as string) -
            Number.parseInt(a.char.rarity as string);
    });
  }
  return result;
});

const locale = getLanguage();
</script>

<template>
  <div class="w-full flex flex-col flex-wrap">
    <SubContainer
      v-for="(chars, subtype) in groupedEquipData"
      :key="subtype"
      :chars="chars"
      :title="subtype"
      :groupby="group"
    />
  </div>
  <NEmpty
    v-if="Object.keys(groupedEquipData).length === 0"
    :description="customLabel[locale].emptyDesc"
  >
    <template #icon>
      <span class="mdi mdi-account-filter-outline text-5xl" />
    </template>
  </NEmpty>
</template>
