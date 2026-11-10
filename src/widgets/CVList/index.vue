<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";

import { useQuery } from "@pinia/colada";
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
import { cvListQuery } from "./data";

const { theme, themeOverrides, isDark } = useTheme();
const i18nConfig = getNaiveUILocale();

const { data: cvData, status, isLoading, refetch } = useQuery(cvListQuery);
const langTypes = computed(() => Object.entries(cvData.value?.langTypes ?? {}));
const tabs = computed(() => langTypes.value.map(([, value]) => value.name));
const nameToKey = computed(() =>
  Object.fromEntries(langTypes.value.map(([key, value]) => [value.name, key])),
);
const valueRef = ref("");

// 取到数据时选第一个页签；地址栏 #语言：声优 跳到那个页签、滚到那位声优
watch(
  cvData,
  () => {
    valueRef.value = tabs.value[0];
    if (window.location.hash) {
      const [lang, name] = decodeURIComponent(window.location.hash).split("：");
      if (tabs.value.includes(lang.slice(1))) valueRef.value = lang.slice(1);
      nextTick(() => {
        document.querySelector(`#${name}`)?.scrollIntoView();
      });
    }
  },
  { once: true },
);
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
      <template v-if="cvData">
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
      <div
        v-else-if="status === 'error' && !isLoading"
        class="py-4 text-center"
      >
        <NButton @click="refetch()">加载失败，点击重试</NButton>
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
