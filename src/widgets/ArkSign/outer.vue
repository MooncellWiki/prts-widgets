<script setup lang="ts">
import { NConfigProvider, NMessageProvider, NModalProvider } from "naive-ui";

import { useTheme } from "@/utils/theme";

import arksignInner from "./index.vue";

const { theme, isDark } = useTheme();

const themeOverrides = {
  common: {
    primaryColor: "#22bbff",
    primaryColorHover: "#91ddff",
    primaryColorPressed: "#91ddff",
  },
  // Button: {
  //   textColor: '#ff69b4'
  // },
  Select: {
    peers: {
      // InternalSelection: {
      //     textColor: '#FF0000'
      // }
    },
  },
};
</script>

<template>
  <n-config-provider
    :theme="theme"
    :theme-overrides="themeOverrides"
    preflight-style-disabled
  >
    <n-message-provider>
      <n-modal-provider>
        <div :class="isDark && 'prts-widget-dark'">
          <arksignInner />
        </div>
      </n-modal-provider>
    </n-message-provider>
  </n-config-provider>
</template>

<style scoped>
@import "../dark-mode.css";
</style>
