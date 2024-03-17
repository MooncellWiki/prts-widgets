<script lang="ts">
import { defineComponent, type PropType } from "vue";

import { NConfigProvider, NTabPane, NTabs } from "naive-ui";

import { getNaiveUILocale } from "@/utils/i18n";
import { useTheme } from "@/utils/theme";

import VoiceLangTab from "./VoiceLangTab.vue";
import type { VoiceLangTypeData } from "./types";

export default defineComponent({
  components: { NConfigProvider, NTabs, NTabPane, VoiceLangTab },
  props: {
    data: {
      type: Object as PropType<Record<string, Record<string, string[]>>>,
      required: true,
    },
    voiceLangTypeDict: {
      type: Object as PropType<VoiceLangTypeData>,
      required: true,
    },
    mapping: {
      type: Object as PropType<Record<string, string>>,
      required: true,
    },
  },
  setup() {
    const { theme } = useTheme();
    const i18nConfig = getNaiveUILocale();

    return { theme, i18nConfig };
  },
});
</script>

<template>
  <NConfigProvider
    preflight-style-disabled
    :theme="theme"
    :locale="i18nConfig.locale"
    :date-locale="i18nConfig.dateLocale"
  >
    <n-tabs type="line" animated>
      <n-tab-pane
        v-for="(value, key) in voiceLangTypeDict"
        :key="key"
        :name="key"
        :tab="value.name"
      >
        <VoiceLangTab v-if="data" :voice-data="data[key]" :mapping="mapping" />
      </n-tab-pane>
    </n-tabs>
  </NConfigProvider>
</template>

<style scoped></style>
