<script setup lang="ts">
import { ref } from "vue";

import {
  AkCollapse,
  AkCollapseItem,
  AkScope,
  type CollapseName,
} from "@mooncellwiki/prts-design-vue";

import VoiceList from "./VoiceList.vue";

import type { Props } from "./types";

// 语音表格（PRTS Design 视觉）：样式来自皮肤 / skins.arknights.components，这里只输出结构。
// 干员页（{{:xx/语音记录}} 嵌入）保持原来「默认折叠」的行为，用设计系统的折叠面板；
// 独立的 /语音记录 页直接展开列表。
const props = withDefaults(defineProps<Props>(), {
  langArr: () => [],
  voiceBase: () => [],
  overrideVoiceBase: () => [],
  cvNames: () => ({}),
  collapsible: false,
});

const opened = ref<CollapseName[]>([]);
const listProps = () => ({
  tocTitle: props.tocTitle,
  voiceKey: props.voiceKey,
  voiceData: props.voiceData,
  langArr: props.langArr,
  voiceBase: props.voiceBase,
  overrideVoiceBase: props.overrideVoiceBase,
  cvNames: props.cvNames,
  downloadable: !props.collapsible,
});

/**
 * Skin:Arknights 的 interactive.js 在 document 上替模板输出的纯 CSS 结构翻状态
 * （.ak-chip 的 is-active / aria-pressed、.ak-voice__play 的 is-playing），这里的状态归 Vue 管，
 * 两边各翻一次就对不上。上游已修（prts-design：AkVoiceList / AkVoice 自带 data-no-toggle，
 * 皮肤脚本的播放钮委托也认它），但 npm 上的 @mooncellwiki/prts-design-vue 0.1.0 与线上皮肤
 * 还是旧的：根节点标 data-no-toggle 让芯片退出那层委托；播放钮那条线上还不认 data-no-toggle，
 * 所以芯片 / 播放钮的 click 在根节点截住，不再冒泡到 document。两边发版后这段可以删。
 */
const stopSkinToggle = (event: MouseEvent) => {
  const target = event.target as Element | null;
  if (target?.closest(".ak-chip, .ak-voice__play")) event.stopPropagation();
};
</script>

<template>
  <AkScope class="voice-table-widget" data-no-toggle @click="stopSkinToggle">
    <AkCollapse v-if="collapsible" v-model="opened">
      <AkCollapseItem name="voice" :title="tocTitle">
        <VoiceList v-bind="listProps()" />
      </AkCollapseItem>
    </AkCollapse>
    <VoiceList v-else v-bind="listProps()" />
  </AkScope>
</template>
