<script setup lang="ts">
import { onScopeDispose } from "vue";

import StoryPlayerDebugShell from "@/widgets/StoryPlayer/components/StoryPlayerDebugShell.vue";
import {
  installStoryRecorderApi,
  StoryRecorder,
} from "@/widgets/StoryPlayer/components/storyRecorder";

const recorder = new StoryRecorder(() => document.querySelector("canvas"));
const uninstall = installStoryRecorderApi(recorder);
onScopeDispose(() => {
  uninstall();
  recorder.dispose();
});
</script>

<template>
  <StoryPlayerDebugShell />
</template>
