<script lang="ts">
import type { PropType } from 'vue'
import { defineComponent } from 'vue'
import { domain, getImagePath } from '@/utils/utils'

export default defineComponent({
  name: 'Avatar',
  props: {
    profession: { type: String, required: true },
    rarity: { type: Number, required: true },
    name: String,
    size: {
      type: String as PropType<'sm' | 'xs'>,
      default: '',
    },
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
  <div class="avatar-container" :class="size">
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
.avatar-container.xs{
  width: 50px;
  height: 50px;
}
.avatar {
  width: 100px;
}
.sm .avatar{
  width: 80px;
}
.xs .avatar{
  width: 50px;
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
.xs .rarity > img{
  height: 9px;
}
.profession {
  position: absolute;
  top: 0px;
}
.profession > img{
  height: 25px;
}
.xs .profession >img{
  height: 12px;
}
</style>
