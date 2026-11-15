<script setup lang="ts">
import { computed, defineAsyncComponent } from "vue";

import { useAsyncState, useTitle } from "@vueuse/core";
import { NConfigProvider } from "naive-ui";

import { useTheme } from "@/utils/theme";
import StoryPlayer from "@/widgets/StoryPlayer/index.vue";

import { EXAMPLE_STORY_PATH, loadPageStory } from "./story";
import { usePageTheme } from "./usePageTheme";

usePageTheme();
const { theme, themeOverrides } = useTheme();
const params = new URLSearchParams(window.location.search);
// DEV 条件使整个调试分支（工具栏、seek、recorder）从生产构建中消除。
const DebugPage =
  import.meta.env.DEV && params.has("debug")
    ? defineAsyncComponent(() => import("./StoryPlayerDebug.vue"))
    : undefined;
if (DebugPage) useTitle("StoryPlayer 独立调试 · PRTS");

const {
  state: script,
  error,
  isLoading,
} = useAsyncState(() => loadPageStory(params), "", { immediate: !DebugPage });
const errorMessage = computed(() =>
  error.value instanceof Error ? error.value.message : String(error.value),
);
</script>

<template>
  <NConfigProvider :theme="theme" :theme-overrides="themeOverrides">
    <component :is="DebugPage" v-if="DebugPage" />
    <p v-else-if="isLoading" class="page-status" role="status">
      正在加载剧情……
    </p>
    <main v-else-if="error" class="page-status" role="alert">
      <h1>剧情加载失败</h1>
      <p>{{ errorMessage }}</p>
      <a :href="`?path=${EXAMPLE_STORY_PATH}`">播放示例剧情</a>
    </main>
    <StoryPlayer v-else-if="script" :script="script" auto-start />
  </NConfigProvider>
</template>
