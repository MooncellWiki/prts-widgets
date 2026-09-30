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
</script>

<template>
  <AkScope class="voice-table-widget">
    <AkCollapse v-if="collapsible" v-model="opened">
      <AkCollapseItem name="voice" :title="tocTitle">
        <VoiceList v-bind="listProps()" />
      </AkCollapseItem>
    </AkCollapse>
    <VoiceList v-else v-bind="listProps()" />
  </AkScope>
</template>
