<script setup lang="ts">
import { computed, ref } from "vue";

import { AkVoice, AkVoiceList } from "@mooncellwiki/prts-design-vue";

import {
  buildDownloads,
  buildLanguages,
  buildSources,
  buildTexts,
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

// 文本语种（台词差分）：AkVoiceList 的多选芯片，可以一个都不选（只听不看）；默认第一个
const texts = computed(() =>
  props.langArr.map((kind) => ({ value: kind, label: kind })),
);
const shownTexts = ref<string[]>(props.langArr.slice(0, 1));

// 语音语种（音频差分）：单选，带 CV 名；不绑初值时取第一个 = |路径= 的第一项
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
    text: buildTexts(item, props.langArr),
    src: buildSources(item, props.voiceBase, props.overrideVoiceBase),
    download: props.downloadable
      ? buildDownloads(item, props.voiceBase, props.overrideVoiceBase)
      : undefined,
    downloadName: item.title ? `${item.title}.wav` : undefined,
  })),
);
</script>

<template>
  <AkVoiceList
    v-model="lang"
    v-model:shown-texts="shownTexts"
    :languages="languages"
    :texts="texts"
  >
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
