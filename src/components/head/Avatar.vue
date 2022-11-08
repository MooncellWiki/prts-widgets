<template>
  <div class="avatar-container">
    <a :href="`/w/${zh}`">
      <img
        class="avatar lazyload"
        :data-src="`${domain}/images/${getImagePath(`头像_${zh}.png`)}`"
      />
      <div class="rarity">
        <img :src="`${domain}/images/${charListData.rarity[rarity]}`" />
      </div>
      <div class="class_">
        <img :src="`${domain}/images/${charListData.class_[class_]}`" />
      </div>
    </a>
  </div>
</template>
<script lang="ts">
import { defineComponent } from 'vue'
import { getImagePath, domain, charListData } from '@/utils/utils'

export default defineComponent({
  name: 'Avatar',
  props: {
    class_: String,
    rarity: Number, //但是应该是数字
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
