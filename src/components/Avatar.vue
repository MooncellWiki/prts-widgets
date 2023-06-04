<script lang="ts">
import { defineComponent } from 'vue'
import { domain, getImagePath } from '@/utils/utils'

export default defineComponent({
  name: 'Avatar',
  props: {
    profession: { type: String, required: true },
    rarity: { type: Number, required: true },
    name: String,
    small: Boolean,
  },
  setup() {
    return {
      getImagePath,
      domain,
    }
  },
})
</script>

<template>
  <div class="avatar-container" :class="{ sm: small }">
    <a :href="`/w/${name}`">
      <img
        class="avatar lazyload"
        :data-src="`${domain}/images/${getImagePath(`头像_${name}.png`)}`"
      >
      <div class="rarity">
        <img :src="`${domain}/images/${getImagePath(`稀有度_黄_${rarity}.png`)}`">
      </div>
      <div class="profession">
        <img :src="`${domain}/images/${getImagePath(`图标_职业_${profession}.png`)}`">
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
.avatar-container.sm{
  width: 80px;
  height: 80px;
}
.avatar {
  width: 100px;
}
.sm .avatar{
  width: 80px;
}
.rarity {
  position: absolute;
  bottom: 0px;
  right: 0px;
}
.rarity > img {
  height: 18px;
}
.sm .rarity > img{
  height: 14px;
}
.profession {
  position: absolute;
  top: 0px;
}
.class > img {
  width: 25px;
}
.sm .class > img {
  width: 20px;
}
</style>
