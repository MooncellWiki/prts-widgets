<script setup lang="ts">
import { ICONS, type SvIconName } from "./icons";

defineProps<{ name: SvIconName }>();
</script>

<template>
  <!-- ICONS 是本地常量，不是外来内容 -->
  <svg
    viewBox="0 0 24 24"
    aria-hidden="true"
    focusable="false"
    v-html="ICONS[name]"
  />
</template>
