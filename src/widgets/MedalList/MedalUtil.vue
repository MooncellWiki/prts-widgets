<script lang="ts">
import { defineComponent, onBeforeMount, ref } from "vue";

import { NSpin } from "naive-ui";

import { getMedalMetaData } from "./MedalMetaData";

export default defineComponent({
  components: { NSpin },
  props: {
    id: { type: String, required: true },
  },
  setup(props) {
    const content = ref("");
    onBeforeMount(async () => {
      content.value = await getMedalMetaData();
    });
    return {
      content,
    };
  },
});
</script>
<template>
  <NSpin :show="!content">
    <div v-html="content" />
    <template #description> 加载中 </template>
  </NSpin>
</template>
