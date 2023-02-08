<script lang="ts">
import { defineComponent } from 'vue'
import { charListData, domain, getImagePath } from '@/utils/utils'

export default defineComponent({
  name: 'Avatar',
  props: {
    class_: { type: String, required: true },
    rarity: { type: Number, required: true },
    zh: String,
  },
  setup() {
    return {
      getImagePath,
      domain,
      charListData,
    }
  },
})
</script>

<template>
  <div class="avatar-container">
    <a :href="`/w/${zh}`">
      <img
        class="avatar lazyload"
        :data-src="`${domain}/images/${getImagePath(`头像_${zh}.png`)}`"
      >
      <div class="rarity">
        <img :src="`${domain}/images/${charListData.rarity[rarity]}`">
      </div>
      <div class="class_">
        <img :src="`${domain}/images/${charListData.class_[class_]}`">
      </div>
    </a>
  </div>
</template>

<style scoped>
.avatar-container {
  position: relative;
  width: 100px;
  height: 100px;
}
.avatar {
  width: 100px;
}
.rarity {
  position: absolute;
  bottom: 0px;
  right: 0px;
}
.rarity > img {
  height: 18px;
}
.class_ {
  position: absolute;
  top: 0px;
}
.class > img {
  width: 25px;
}
</style>
