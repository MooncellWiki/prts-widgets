<script lang="ts">
import { defineComponent, ref } from "vue";

import { NConfigProvider, NRadioButton, NRadioGroup } from "naive-ui";

import { getNaiveUILocale } from "@/utils/i18n";
import { useTheme } from "@/utils/theme";
import { isMobileSkin } from "@/utils/utils";

export default defineComponent({
  components: { NConfigProvider, NRadioButton, NRadioGroup },
  props: {
    type: String,
    id: String,
    isAct: Boolean,
    language: String,
  },
  setup() {
    const { theme } = useTheme();
    const i18nConfig = getNaiveUILocale();
    const isMobile = isMobileSkin();

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
    return {
      theme,
      i18nConfig,
      isMobile,
      selectedServer,
      selectedStage,
      servers,
      stages,
    };
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
      :height="isMobile ? 800 : 600"
      :width="isMobile ? '95%' : 1000"
      style="
        border: 2px solid #ccc;
        border-radius: 8px;
        box-shadow: 0 0 10px rgba(0, 0, 0, 0.18);
        margin: 8px;
      "
    />
  </NConfigProvider>
</template>

<style scoped></style>
