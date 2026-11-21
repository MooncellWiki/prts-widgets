<script setup lang="ts">
import { computed, defineAsyncComponent } from "vue";

import { AkButton, AkMessage, AkSpinner } from "@mooncellwiki/prts-design-vue";
import { useAsyncState, useTitle } from "@vueuse/core";

import StoryPlayer from "@/widgets/StoryPlayer/index.vue";

import { EXAMPLE_STORY_PATH, loadPageStory } from "./story";
import { usePageTheme } from "./usePageTheme";

usePageTheme();
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
  <component :is="DebugPage" v-if="DebugPage" />
  <main v-else class="story-page ak-not-prose">
    <AkSpinner
      v-if="isLoading"
      class="page-status"
      description="正在加载剧情…"
    />
    <div v-else-if="error" class="page-status">
      <AkMessage variant="danger" title="剧情加载失败">
        {{ errorMessage }}
      </AkMessage>
      <AkButton :href="`?path=${EXAMPLE_STORY_PATH}`" icon="play" size="sm">
        播放示例剧情
      </AkButton>
    </div>
    <StoryPlayer v-else-if="script" :script="script" auto-start />
  </main>
</template>

<style scoped>
.story-page {
  padding: clamp(var(--ak-space-2), 2vw, var(--ak-space-6));
}

.page-status .ak-btn {
  margin-top: var(--ak-space-3);
}
</style>
