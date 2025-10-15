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
    <NTag
      v-bind="typeColor ? { color: typeColor } : {}"
      size="small"
      :bordered="false"
      class="mx-2"
    >
      {{ channelName }}
    </NTag>
  </div>
</template>
