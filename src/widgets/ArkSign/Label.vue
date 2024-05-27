<script setup lang="ts">
import { NTag } from "naive-ui";
import { TagColor } from "naive-ui/es/tag/src/common-props";
defineProps<{
  nickName: string;
  typeColor: TagColor;
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
