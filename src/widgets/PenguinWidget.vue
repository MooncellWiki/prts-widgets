<script setup lang="ts">
import { ref } from "vue";

import { NConfigProvider, NRadioButton, NRadioGroup } from "naive-ui";

import { getNaiveUILocale } from "@/utils/i18n";
import { useTheme } from "@/utils/theme";

defineProps<{
  type?: string;
  id?: string;
  isAct?: boolean;
  language?: string;
}>();
const { theme, themeOverrides, isDark } = useTheme();
const i18nConfig = getNaiveUILocale();

const servers = [
  {
    value: "CN",
    label: "国服(CN)",
  },
  {
    value: "JP",
    label: "日服(JP)",
  },
  {
    value: "US",
    label: "美服(US)",
  },
  {
    value: "KR",
    label: "韩服(KR)",
  },
];
const stages = [
  { value: "", label: "活动" },
  { value: "_perm", label: "常驻" },
  { value: "_rep", label: "复刻" },
];

const selectedServer = ref(servers[0].value);
const selectedStage = ref(stages[0].value);
</script>

<template>
  <NConfigProvider
    preflight-style-disabled
    :theme="theme"
    :theme-overrides="themeOverrides"
    :locale="i18nConfig.locale"
    :date-locale="i18nConfig.dateLocale"
  >
    <div :class="[isDark && 'prts-widget-dark']">
      <NRadioGroup
        v-model:value="selectedServer"
        class="mb-2 w-full"
        name="penguin-server-option-group"
      >
        <NRadioButton
          v-for="server in servers"
          :key="server.value"
          :value="server.value"
          :label="server.label"
        />
      </NRadioGroup>
      <NRadioGroup
        v-if="isAct"
        v-model:value="selectedStage"
        class="mb-1 w-full"
        name="penguin-stage-option-group"
      >
        <NRadioButton
          v-for="stage in stages"
          :key="stage.value"
          :value="stage.value"
          :label="stage.label"
        />
      </NRadioGroup>
      <iframe
        class="penguin-widget"
        :src="`https://widget.penguin-stats.cn/result/${selectedServer}/${type}/${id}${
          isAct ? selectedStage : ''
        }?lang=${language}`"
        title="Penguin Statistics Widget"
        frameborder="0"
        loading="lazy"
      />
    </div>
  </NConfigProvider>
</template>

<style scoped>
@import "@/styles/dark-mode.scss";

/* 移动端不一定是 Minerva 皮肤（Arknights 皮肤是响应式的），宽高按可用宽度走，不按皮肤判断 */
.penguin-widget {
  box-sizing: border-box;
  width: 100%;
  max-width: 1000px;
  height: 600px;
  margin: 8px 0;
  border: 2px solid #ccc;
  border-radius: 8px;
  box-shadow: 0 0 10px rgba(0, 0, 0, 0.18);
}

@media screen and (max-width: 640px) {
  .penguin-widget {
    height: 800px;
  }
}
</style>
