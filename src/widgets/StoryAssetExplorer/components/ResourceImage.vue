<script setup lang="ts">
import { computed, ref, watch } from "vue";

import { AkIcon } from "@mooncellwiki/prts-design-vue";

import { cdnImageUrl, type CharacterPreview } from "../utils";

/**
 * 一张资源图：单图直接放；叠图角色把脸叠在身体上（同 NpcPortrait：按底图原始尺寸把 faceRect 换算成百分比，
 * 脸拉伸进 faceRect，和 StoryPlayer 的 canvas 合成一致），不经 canvas，也不用把原图整张取下来再缩。
 *
 * thumb 时走 CDN 缩图：单图按最长边缩；叠图的底图和脸都按同一个百分比缩，
 * 这样不用知道原图多大，也能从缩后的宽度反推出 faceRect 的比例。
 */
const props = withDefaults(
  defineProps<{
    /** null = 没有可显示的图；undefined = 还在等 character.json，先空着 */
    preview: CharacterPreview | null | undefined;
    /** 缩略图：单图最长边缩到这么多 px；不写是原图 */
    thumb?: number;
    webp?: boolean;
    /** 单图的铺法：contain 整张放下（默认）· cover 铺满裁边 */
    fit?: "contain" | "cover";
    alt?: string;
    /** 不懒加载（详情大图） */
    eager?: boolean;
  }>(),
  { thumb: undefined, webp: false, fit: "contain", alt: "", eager: false },
);

/** 叠图缩略图的缩放比：身体原图多在 1024 ~ 1800，缩到 30% 约 300 ~ 540，够 2 倍屏上 150px 的格子 */
const COMPOSITE_THUMB_SCALE = 0.3;

const scale = computed(() => (props.thumb ? COMPOSITE_THUMB_SCALE : 1));

function sized(url: string, kind: "edge" | "percent"): string {
  if (!props.thumb) return url;
  const operation =
    kind === "edge"
      ? `resize,l_${props.thumb}`
      : `resize,p_${Math.round(COMPOSITE_THUMB_SCALE * 100)}`;
  return cdnImageUrl(url, operation, props.webp);
}

const mainSrc = computed(() => {
  const preview = props.preview;
  if (!preview) return null;
  return preview.kind === "single"
    ? sized(preview.url, "edge")
    : sized(preview.baseUrl, "percent");
});

const faceSrc = computed(() =>
  props.preview?.kind === "composite"
    ? sized(props.preview.faceUrl, "percent")
    : null,
);

const loaded = ref(false);
const failed = ref(false);
/** 叠图底图的原始尺寸（缩略图按缩放比反推） */
const baseSize = ref<{ width: number; height: number } | null>(null);

watch(mainSrc, () => {
  loaded.value = false;
  failed.value = false;
  baseSize.value = null;
});

function onLoad(event: Event): void {
  const image = event.target as HTMLImageElement;
  loaded.value = true;
  baseSize.value = {
    width: image.naturalWidth / scale.value,
    height: image.naturalHeight / scale.value,
  };
}

const faceStyle = computed(() => {
  const size = baseSize.value;
  const preview = props.preview;
  if (preview?.kind !== "composite" || !size) return null;
  const { x, y, w, h } = preview.faceRect;
  if (w <= 0 || h <= 0) return null;
  const percent = (value: number, total: number) => `${(value / total) * 100}%`;
  return {
    left: percent(x, size.width),
    top: percent(y, size.height),
    width: percent(w, size.width),
    height: percent(h, size.height),
  };
});
</script>

<template>
  <div
    :class="[
      'sae-img',
      `sae-img--${fit}`,
      { 'is-loaded': loaded, 'is-composite': preview?.kind === 'composite' },
    ]"
  >
    <template v-if="preview === undefined" />
    <span v-else-if="!mainSrc || failed" class="sae-img__none">
      <AkIcon name="empty" :size="28" />
      <span>{{ mainSrc ? "图片加载失败" : "没有预览" }}</span>
    </span>
    <span v-else class="sae-img__frame">
      <img
        :key="mainSrc"
        :src="mainSrc"
        :alt="alt"
        :loading="eager ? undefined : 'lazy'"
        decoding="async"
        draggable="false"
        @load="onLoad"
        @error="failed = true"
      />
      <img
        v-if="faceSrc && faceStyle"
        :key="faceSrc"
        :src="faceSrc"
        alt=""
        class="sae-img__face"
        decoding="async"
        draggable="false"
        :style="faceStyle"
      />
    </span>
  </div>
</template>

<style scoped lang="scss">
.sae-img {
  position: relative;
  display: grid;
  place-items: center;
  width: 100%;
  height: 100%;
  overflow: hidden;
  // 叠图的外框要取格子宽高里较小的那边（见下），靠容器单位
  container-type: size;
}

// 单图：img 自己按 object-fit 铺进格子
.sae-img__frame {
  display: contents;

  > img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: contain;
    opacity: 0;
    transition: opacity var(--ak-dur-fast);
  }
}

.sae-img--cover .sae-img__frame > img {
  object-fit: cover;
}

.is-loaded .sae-img__frame > img {
  opacity: 1;
}

// 叠图：外框就是底图的大小，脸按百分比定位在上面。角色图都是正方形：外框取格子宽高里较小的那边，
// 不认容器单位的浏览器退回占满宽度（格子本身也是正方形）
.is-composite .sae-img__frame {
  position: relative;
  display: block;
  width: 100%;
  aspect-ratio: 1;

  @supports (width: 1cqmin) {
    width: 100cqmin;
  }

  > img:first-child {
    height: auto;
  }
}

.sae-img__frame > .sae-img__face {
  position: absolute;
  width: auto;
  height: auto;
  object-fit: fill;
}

.sae-img__none {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  font-size: var(--ak-fs-xs);
  color: var(--ak-fg-subtle);
}
</style>
