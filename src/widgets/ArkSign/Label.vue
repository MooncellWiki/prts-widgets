<script lang="ts">
import { NTag } from "naive-ui";
import { TagColor } from "naive-ui/es/tag/src/common-props";
import { PropType, defineComponent } from "vue";
export default defineComponent({
  components: { NTag },
  props: {
    nickName: {
      type: String,
      required: true,
    },
    typeColor: {
      type: Object as PropType<TagColor>,
      required: true,
    },
    channelName: {
      type: String,
      required: true,
    },
  },
});
</script>
<template>
  <div class="flex items-center">
    {{ nickName }}
    <NTag size="small" :bordered="false" :color="typeColor" class="mx-2">
      {{ channelName }}
    </NTag>
  </div>
</template>
