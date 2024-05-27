<script setup lang="ts">
import { TORAPPU_ENDPOINT } from "@/utils/consts";
const props = defineProps<{
  voiceData: Record<string, string[]>;
  mapping: Record<string, string>;
  avatarMapping: Record<string, string>;
  charMapping: Record<string, string>;
}>();

const getAvatarURL = (voiceId: string) => {
  const avatarId = props.avatarMapping[voiceId] || voiceId;
  return new URL(
    `/assets/char_avatar/${encodeURIComponent(avatarId)}.png`,
    TORAPPU_ENDPOINT,
  );
};
</script>

<template>
  <div v-for="(voiceIds, cvName) in voiceData" :key="cvName">
    <h2>
      <span :id="cvName" class="mw-headline">{{ cvName }}</span>
    </h2>
    <a
      v-for="voiceId in voiceIds"
      :key="[cvName, voiceId].join('_')"
      :href="`/w/${mapping[charMapping[voiceId] || voiceId]}`"
    >
      <img
        class="lazyload"
        :data-src="getAvatarURL(voiceId).toString()"
        width="80"
      />
    </a>
  </div>
</template>

<style scoped></style>
