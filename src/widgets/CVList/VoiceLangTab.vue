<script lang="ts">
import { defineComponent, type PropType } from "vue";

import { TORAPPU_ENDPOINT } from "@/utils/consts";

const getAvatarURL = (charId: string) => {
  return new URL(`/assets/char_avatar/${charId}.png`, TORAPPU_ENDPOINT);
};

export default defineComponent({
  components: {},
  props: {
    voiceData: {
      type: Object as PropType<Record<string, string[]>>,
      required: true,
    },
    mapping: {
      type: Object as PropType<Record<string, string>>,
      required: true,
    },
  },
  setup() {
    return { getAvatarURL };
  },
});
</script>

<template>
  <div v-for="(charIds, cvName) in voiceData" :key="cvName">
    <h2>
      <span :id="cvName" class="mw-headline">{{ cvName }}</span>
    </h2>
    <a
      v-for="charId in charIds"
      :key="[cvName, charId].join('_')"
      :href="`/w/${mapping[charId]}`"
    >
      <img class="lazyload" :src="getAvatarURL(charId).toString()" width="80"
    /></a>
  </div>
</template>

<style scoped></style>
