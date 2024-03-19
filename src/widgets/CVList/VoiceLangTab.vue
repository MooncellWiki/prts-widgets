<script lang="ts">
import { defineComponent, type PropType } from "vue";

import { TORAPPU_ENDPOINT } from "@/utils/consts";

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
    avatarMapping: {
      type: Object as PropType<Record<string, string>>,
      required: true,
    },
    charMapping: {
      type: Object as PropType<Record<string, string>>,
      required: true,
    },
  },
  setup(props) {
    const getAvatarURL = (voiceId: string) => {
      const avatarId = props.avatarMapping[voiceId] || voiceId;
      return new URL(
        `/assets/char_avatar/${encodeURIComponent(avatarId)}.png`,
        TORAPPU_ENDPOINT,
      );
    };
    return { getAvatarURL };
  },
});
</script>

<template>
  <div v-for="(voiceIds, cvName) in voiceData" :key="cvName">
    <h2>
      <span :id="cvName" class="mw-headline">{{ cvName }}</span>
    </h2>
    <a
      v-for="voiceId in voiceIds"
      :key="[cvName, voiceId].join('_')"
      :href="`/w/${mapping[charMapping[voiceId]]}`"
    >
      <img
        class="lazyload"
        :src="getAvatarURL(voiceId).toString()"
        width="80"
      />
    </a>
  </div>
</template>

<style scoped></style>
