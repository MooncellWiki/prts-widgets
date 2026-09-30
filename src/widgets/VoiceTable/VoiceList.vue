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
  <div class="voice-table-list">
    <div
      v-if="langArr.length"
      class="voice-table-kinds ak-voice-langs ak-not-prose"
      role="group"
      :aria-labelledby="kindsId"
    >
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
    <AkVoiceList
      v-model="lang"
      class="voice-table-voices"
      :languages="languages"
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
  </div>
</template>

<style scoped>
/*
 * 文本 / 语种两组选择器排在一行，放不下时语种整组换到第二行（一组自己都放不下时再在组内折行）。
 * AkVoiceList 的根节点是个裸 div，display: contents 让它的切换条和列表直接成为这里的 flex 项。
 */
.voice-table-list {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  column-gap: var(--ak-space-4);
}

.voice-table-list :deep(.voice-table-voices) {
  display: contents;
}

.voice-table-list :deep(.ak-voice-langs) {
  flex: 0 0 auto;
  max-width: 100%;
}

.voice-table-list :deep(.ak-voice-list) {
  flex: 1 0 100%;
  box-sizing: border-box; /* 100% 基准含 1px 外框，MW 没有全局 border-box 重置 */
}

/* 多选了几种文本时一种一行；AkVoice 只收一个字符串，这里按换行排 */
.voice-table-list :deep(.ak-voice__text) {
  white-space: pre-line;
}
</style>
