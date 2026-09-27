<script setup lang="ts">
import { computed } from "vue";

import { wikiImage, wikiLink } from "../utils";

import type { SkinGalleryEntry } from "../types";

// Widget:SkinGallery（模板:时装回廊/半身像）的简化版：半身像 + 系列 logo + 时装名
const props = defineProps<{
  skinName: string;
  /** 模板:时装回廊 里还没收录的新时装为空，退化成占位图 */
  entry?: SkinGalleryEntry;
}>();

const href = computed(() =>
  props.entry
    ? wikiLink(`时装回廊/${props.entry.series}`, props.entry.anchor)
    : wikiLink("时装回廊"),
);
</script>

<template>
  <a class="skin-portrait" :href="href" :title="skinName">
    <img
      v-if="entry?.series"
      class="skin-portrait-logo"
      :src="wikiImage(`Skin brand ${entry.series}.png`)"
      alt=""
      loading="lazy"
    />
    <img
      class="skin-portrait-image"
      :src="
        wikiImage(
          entry
            ? `半身像_${entry.charName}_skin${entry.skinIndex}.png`
            : '无图片占位符.png',
        )
      "
      :alt="skinName"
      loading="lazy"
    />
    <span v-if="entry?.tag" class="skin-portrait-tag">{{ entry.tag }}</span>
    <span class="skin-portrait-footer">
      <span class="skin-portrait-name">{{ skinName }}</span>
      <span class="skin-portrait-meta">
        {{ entry ? `${entry.charName} · ${entry.series}` : "未收录时装" }}
      </span>
    </span>
  </a>
</template>

<style scoped>
.skin-portrait {
  position: relative;
  display: block;
  width: 120px;
  height: 276px;
  overflow: hidden;
  background: #fff;
  box-shadow: 0 3px 6px #0005;
  transition: transform 0.2s ease;
}

.skin-portrait:hover {
  transform: scale(1.04);
}

.skin-portrait-logo {
  position: absolute;
  top: 10px;
  left: -16px;
  width: 100px;
  opacity: 0.15;
  filter: invert(1);
}

.skin-portrait-image {
  position: absolute;
  top: 0;
  left: 0;
  width: 120px;
  height: 240px;
  object-fit: contain;
  object-position: bottom;
}

.skin-portrait-tag {
  position: absolute;
  top: 5px;
  right: 0;
  padding: 0 6px;
  background: #0224ff;
  color: #fff;
  font-size: 12px;
  line-height: 20px;
}

.skin-portrait-footer {
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  height: 36px;
  padding: 0 4px;
  background: #fff;
  text-align: left;
}

.skin-portrait-name {
  overflow: hidden;
  color: #313131;
  font-size: 13px;
  font-weight: bold;
  line-height: 16px;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.skin-portrait-meta {
  overflow: hidden;
  color: #9d9d9d;
  font-size: 10px;
  line-height: 13px;
  white-space: nowrap;
  text-overflow: ellipsis;
}
</style>
