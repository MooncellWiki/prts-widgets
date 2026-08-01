<script setup lang="ts">
import { nextTick, onMounted, ref } from "vue";

import {
  NButton,
  NConfigProvider,
  NLayout,
  NSkeleton,
  NTabPane,
  NTabs,
} from "naive-ui";

import { getNaiveUILocale } from "@/utils/i18n";
import { useTheme } from "@/utils/theme";

import VoiceLangTab from "./VoiceLangTab.vue";
import { fetchCVListData, type CVListData } from "./data";

const { theme, themeOverrides, isDark } = useTheme();
const i18nConfig = getNaiveUILocale();

const state = ref<"loading" | "succ" | "fail">("loading");
const cvData = ref<CVListData>();
const tabs = ref<string[]>([]);
const nameToKey = ref<Record<string, string>>({});
const valueRef = ref("");

async function load() {
  state.value = "loading";
  try {
    const result = await fetchCVListData();
    cvData.value = result;
    tabs.value = Object.values(result.langTypes).map((v) => v.name);
    nameToKey.value = Object.fromEntries(
      Object.entries(result.langTypes).map(([key, value]) => [value.name, key]),
    );
    valueRef.value = tabs.value[0];
    state.value = "succ";

    if (window.location.hash) {
      const [lang, name] = decodeURIComponent(window.location.hash).split("：");
      if (tabs.value.includes(lang.slice(1))) valueRef.value = lang.slice(1);
      nextTick(() => {
        document.querySelector(`#${name}`)?.scrollIntoView();
      });
    }
  } catch (error) {
    console.error("[CVList] failed to load data:", error);
    state.value = "fail";
  }
}

onMounted(load);
</script>

<template>
  <NConfigProvider
    preflight-style-disabled
    inline-theme-disabled
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
      <template v-if="state === 'succ' && cvData">
        <NTabs v-model:value="valueRef" type="line" animated>
          <NTabPane v-for="tab in tabs" :key="tab" :name="tab">
            <VoiceLangTab
              :voice-data="cvData.data[nameToKey[tab]]"
              :mapping="cvData.mapping"
              :avatar-mapping="cvData.avatarMapping"
              :char-mapping="cvData.charMapping"
            />
          </NTabPane>
        </NTabs>
      </template>
      <div v-else-if="state === 'fail'" class="py-4 text-center">
        <NButton @click="load()">加载失败，点击重试</NButton>
      </div>
      <div v-else class="flex flex-col gap-4 py-2">
        <NSkeleton text style="width: 40%; height: 32px" />
        <NSkeleton text style="width: 25%; height: 28px" />
        <div class="flex flex-wrap gap-1">
          <NSkeleton
            v-for="i in 18"
            :key="i"
            :sharp="true"
            style="width: 80px; height: 80px"
          />
        </div>
      </div>
    </NLayout>
  </NConfigProvider>
</template>

<style scoped>
@import "@/styles/dark-mode.scss";
</style>
