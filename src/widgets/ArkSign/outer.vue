<script setup lang="ts">
import { NConfigProvider, NMessageProvider, NModalProvider } from "naive-ui";

import { useTheme } from "@/utils/theme";

import arksignInner from "./index.vue";

const { theme, themeOverrides, isDark } = useTheme({
  common: {
    primaryColor: "#22bbff",
    primaryColorHover: "#91ddff",
    primaryColorPressed: "#91ddff",
  },
});
</script>

<template>
  <NConfigProvider
    :theme="theme"
    :theme-overrides="themeOverrides"
    preflight-style-disabled
  >
    <NMessageProvider>
      <NModalProvider>
        <div :class="isDark && 'prts-widget-dark'">
          <arksignInner />
        </div>
      </NModalProvider>
    </NMessageProvider>
  </NConfigProvider>
</template>

<style scoped>
@import "@/styles/dark-mode.scss";
</style>
