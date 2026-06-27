<script setup lang="ts">
import { nextTick, ref } from "vue";

import { NConfigProvider, NLayout, NTabPane, NTabs } from "naive-ui";

import { getNaiveUILocale } from "@/utils/i18n";
import { useTheme } from "@/utils/theme";

import VoiceLangTab from "./VoiceLangTab.vue";

import type { VoiceLangTypeData } from "./types";

const props = defineProps<{
  data: Record<string, Record<string, string[]>>;
  langTypes: VoiceLangTypeData;
  mapping: Record<string, string>;
  avatarMapping: Record<string, string>;
  charMapping: Record<string, string>;
}>();

const { theme, themeOverrides, isDark } = useTheme();
const i18nConfig = getNaiveUILocale();

const tabs = ref(Object.values(props.langTypes).map((v) => v.name));
const valueRef = ref(tabs.value[0]);

const nameToKey = Object.fromEntries(
  Object.entries(props.langTypes).map(([key, value]) => [value.name, key]),
);

if (window.location.hash) {
  const [lang, name] = decodeURIComponent(window.location.hash).split("：");
  valueRef.value = lang.slice(1);
  nextTick(() => {
    document.querySelector(`#${name}`)?.scrollIntoView();
  });
}
</script>

<template>
  <NConfigProvider
    preflight-style-disabled
    :theme="theme"
    :theme-overrides="themeOverrides"
    :locale="i18nConfig.locale"
    :date-locale="i18nConfig.dateLocale"
  >
    <NLayout
      :class="[
        'mx-auto bg-transparent p-2 antialiased',
        isDark && 'prts-widget-dark',
      ]"
    >
      <NTabs v-model:value="valueRef" type="line" animated>
        <NTabPane v-for="tab in tabs" :key="tab" :name="tab">
          <VoiceLangTab
            v-if="data"
            :voice-data="data[nameToKey[tab]]"
            :mapping="mapping"
            :avatar-mapping="avatarMapping"
            :char-mapping="charMapping"
          />
        </NTabPane>
      </NTabs>
    </NLayout>
  </NConfigProvider>
</template>

<style scoped>
@import "@/styles/dark-mode.scss";
</style>
