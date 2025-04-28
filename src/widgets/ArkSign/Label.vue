<script setup lang="ts">
import { NTag, type TagProps } from "naive-ui";

defineProps<{
  nickName: string;
  typeColor: TagProps["color"];
  channelName: string;
}>();
</script>

<template>
  <div class="flex items-center">
    {{ nickName }}
    <NTag size="small" :bordered="false" :color="typeColor" class="mx-2">
      {{ channelName }}
    </NTag>
  </div>
</template>
