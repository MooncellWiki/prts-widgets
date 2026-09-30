<script setup lang="ts">
import { computed, ref, useId } from "vue";

import { AkChip, AkVoice, AkVoiceList } from "@mooncellwiki/prts-design-vue";

import {
  buildDownloads,
  buildLanguages,
  buildSources,
  buildText,
  unlockText,
  voiceCode,
} from "./voice";

import type { Props } from "./types";

const props = withDefaults(defineProps<Props>(), {
  langArr: () => [],
  voiceBase: () => [],
  overrideVoiceBase: () => [],
  cvNames: () => ({}),
  downloadable: false,
});

// 文本语种（台词差分）：多选，同时显示，可以一个都不选（只听不看）；默认第一个
const selectedKinds = ref<string[]>(props.langArr.slice(0, 1));
const toggleKind = (kind: string, on: boolean) => {
  const rest = selectedKinds.value.filter((k) => k !== kind);
  selectedKinds.value = on
    ? props.langArr.filter((k) => k === kind || rest.includes(k))
    : rest;
};

// 语音语种（音频差分）：单选，AkVoiceList 的芯片带 CV 名；不绑初值时取第一个 = |路径= 的第一项
const lang = ref<string>();
const languages = computed(() =>
  buildLanguages(props.voiceBase, props.cvNames),
);

const rows = computed(() =>
  props.voiceData.map((item, index) => ({
    key: item.index ?? String(index),
    title: item.title ?? "",
    code: voiceCode(item.fileName),
    unlock: unlockText(item),
    text: buildText(item, selectedKinds.value),
    src: buildSources(item, props.voiceBase, props.overrideVoiceBase),
    download: props.downloadable
      ? buildDownloads(item, props.voiceBase, props.overrideVoiceBase)
      : undefined,
    downloadName: item.title ? `${item.title}.wav` : undefined,
  })),
);

const kindsId = useId();
</script>

<template>
  <AkVoiceList v-model="lang" :languages="languages">
    <!-- 文本那排放进 AkVoiceList 的 #toolbar：与语种切换条排一行，放不下时语种整组换行 -->
    <template v-if="langArr.length" #toolbar>
      <div class="ak-voice-langs" role="group" :aria-labelledby="kindsId">
        <span :id="kindsId" class="ak-overline">文本</span>
        <AkChip
          v-for="kind in langArr"
          :key="kind"
          :model-value="selectedKinds.includes(kind)"
          @update:model-value="(on) => toggleKind(kind, on)"
        >
          {{ kind }}
        </AkChip>
      </div>
    </template>
    <AkVoice
      v-for="row in rows"
      :key="row.key"
      :title="row.title"
      :code="row.code"
      :unlock="row.unlock"
      :text="row.text"
      :src="row.src"
      :download="row.download"
      :download-name="row.downloadName"
    />
  </AkVoiceList>
</template>
