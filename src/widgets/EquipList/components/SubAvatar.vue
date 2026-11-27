<script setup lang="ts">
import { useVModel } from "@vueuse/core";

import { TORAPPU_ENDPOINT } from "@/utils/consts";
import { getImagePath } from "@/utils/utils";

import { shadowColor } from "../consts";
import { useEquipListStore } from "../store";

import Equip from "./Equip.vue";

import type { CharEquips } from "../types";

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
const store = useEquipListStore();
const toggleShow = (c: CharEquips) => {
  // showInfo 读的是 props.show，刚赋完值读回来还是旧的，先记下来
  const show = !store.isShown(c);
  if (show) store.expand([c]);
  else store.collapse([c]);
  showInfo.value = show;
};
</script>

<template>
  <div class="sub-avatar" :style="{ width: showInfo ? '100%' : 'auto' }">
    <div class="sub-avatar__row">
      <div class="sub-avatar__pic" @click="toggleShow(char)">
        <img
          :src="getImagePath(`头像_${char.char.name}_2.png`)"
          width="60"
          height="60"
        />
        <span class="sub-avatar__index">
          <span
            v-for="e in char.equips"
            :key="e.name"
            class="sub-avatar__extra"
            :style="{
              filter:
                `drop-shadow(0 1px 0.8px ${shadowColor[e.color!] ?? 'grey'}) ` +
                `drop-shadow(0 -1px 0.8px ${shadowColor[e.color!] ?? 'grey'}) ` +
                `drop-shadow(1px 0 0.8px ${shadowColor[e.color!] ?? 'grey'}) ` +
                `drop-shadow(-1px 0 0.8px ${shadowColor[e.color!] ?? 'grey'}) `,
            }"
          >
            <img
              :src="`${TORAPPU_ENDPOINT}/assets/uniequip_extratype/${e.typeIcon?.at(-1)?.toLowerCase()}.png`"
              class="sub-avatar__extra-icon"
              width="9"
              height="9"
            />
          </span>
        </span>
      </div>
      <div v-if="showInfo" class="sub-avatar__name">
        <span class="sub-avatar__name-text"
          ><a :href="`/w/${char.char.name}`">{{ char.char.name }}</a>
        </span>
      </div>
    </div>
    <div v-if="showInfo" class="sub-avatar__meta">
      <Equip :name="char.char.name" :data="char.equips"></Equip>
    </div>
  </div>
</template>

<style scoped>
.sub-avatar {
  display: flex;
  flex: none;
  flex-direction: column;
}

.sub-avatar__row {
  display: flex;
}

.sub-avatar__pic {
  position: relative;
  display: inline-block;
  flex: none;
  width: 60px;
  height: 60px;
  margin: 2px;
  cursor: pointer;
}

.sub-avatar__index {
  position: absolute;
  bottom: -8%;
  left: 0;
  font-size: 18px;
  font-weight: 900;
}

.sub-avatar__extra {
  margin-inline: 2px;
}

.sub-avatar__extra-icon {
  width: 9px;
  height: 9px;
}

.sub-avatar__name {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
}

.sub-avatar__name-text {
  font-weight: 700;
}

.sub-avatar__meta {
  width: 100%;
}
</style>
