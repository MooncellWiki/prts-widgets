<script setup lang="ts">
import { computed } from "vue";

import { NDivider, NH2 } from "naive-ui";

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

const sortedVoiceData = computed(() => {
  const sortedCvNames = Object.keys(props.voiceData).sort((cvNameA, cvNameB) =>
    cvNameA.localeCompare(cvNameB),
  );

  const ordered = sortedCvNames.map((cvName) => ({
    cvName,
    voiceIds: props.voiceData[cvName],
  }));

  return ordered;
});

const lastVoiceIdsIndex = computed(() => sortedVoiceData.value.length - 1);
</script>

<template>
  <div v-for="(item, index) in sortedVoiceData" :key="item.cvName">
    <NH2 class="border-b-0">
      <span :id="item.cvName" class="mw-headline">{{ item.cvName }}</span>
    </NH2>
    <a
      v-for="voiceId in item.voiceIds"
      :key="[item.cvName, voiceId].join('_')"
      :href="`/w/${mapping[charMapping[voiceId] || voiceId]}`"
    >
      <img
        class="min-h-[80px]"
        style="width: 80px; height: 80px"
        :src="getAvatarURL(voiceId).toString()"
        loading="lazy"
        width="80"
      />
    </a>
    <NDivider v-if="index !== lastVoiceIdsIndex" />
  </div>
</template>

<style scoped></style>
