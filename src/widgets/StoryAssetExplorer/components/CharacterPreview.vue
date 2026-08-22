<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";

import { NImage, NSpin } from "naive-ui";

import type { CharacterPreview } from "../utils";

const props = defineProps<{
  preview: CharacterPreview;
}>();

/** 卡片预览合成的最长边，控制 canvas 与导出图的体积 */
const MAX_EDGE = 480;

const compositeUrl = ref<string | null>(null);
const failed = ref(false);
const hostRef = ref<HTMLElement | null>(null);

const drawToken = ref(0);
const resultUrl = ref<string | null>(null);
const observer = ref<IntersectionObserver | null>(null);

const displaySrc = computed(() =>
  props.preview.kind === "single" ? props.preview.url : compositeUrl.value,
);

/**
 * 内容指纹，而不是 `props.preview` 本身：父级的 `cards` 是 computed，每次重算
 * 都会产出新对象，按引用 watch 会让每张卡片反复重新合成。
 */
const previewKey = computed(() =>
  props.preview.kind === "single"
    ? props.preview.url
    : `${props.preview.baseUrl}|${props.preview.faceUrl}`,
);

function fetchImage(url: string): Promise<{ image: HTMLImageElement }> {
  return fetch(url)
    .then((response) => {
      if (!response.ok) throw new Error(`fetch ${url} ${response.status}`);
      return response.blob();
    })
    .then(
      (blob) =>
        new Promise<{ image: HTMLImageElement }>((resolve, reject) => {
          const objectUrl = URL.createObjectURL(blob);
          const image = new Image();
          image.decoding = "async";
          image.addEventListener(
            "load",
            () => {
              URL.revokeObjectURL(objectUrl);
              resolve({ image });
            },
            { once: true },
          );
          image.addEventListener(
            "error",
            () => {
              URL.revokeObjectURL(objectUrl);
              reject(new Error(`load ${url}`));
            },
            { once: true },
          );
          image.src = objectUrl;
        }),
    );
}

function canvasAsPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("encode composite preview"));
    }, "image/png");
  });
}

async function drawComposite(): Promise<void> {
  if (props.preview.kind !== "composite") {
    return;
  }

  const token = drawToken.value + 1;
  drawToken.value = token;
  try {
    const [base, face] = await Promise.all([
      fetchImage(props.preview.baseUrl),
      fetchImage(props.preview.faceUrl),
    ]);
    if (token !== drawToken.value) return;

    const rect = props.preview.faceRect;
    const scale = Math.min(
      1,
      MAX_EDGE / Math.max(base.image.naturalWidth, base.image.naturalHeight),
    );
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(base.image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(base.image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("canvas 2d context is unavailable");

    context.drawImage(base.image, 0, 0, canvas.width, canvas.height);
    context.drawImage(
      face.image,
      rect.x * scale,
      rect.y * scale,
      rect.w * scale,
      rect.h * scale,
    );

    const encoded = await canvasAsPng(canvas);
    if (token !== drawToken.value) return;
    resultUrl.value = URL.createObjectURL(encoded);
    compositeUrl.value = resultUrl.value;
  } catch (error) {
    if (token === drawToken.value) failed.value = true;
    console.warn(error);
  }
}

function releaseResult(): void {
  if (resultUrl.value) URL.revokeObjectURL(resultUrl.value);
  resultUrl.value = null;
}

/** 丢弃上一轮合成并重新挂观察器；`preview` 换内容时也要走一遍 */
function arm(): void {
  observer.value?.disconnect();
  observer.value = null;
  drawToken.value += 1;
  releaseResult();
  compositeUrl.value = null;
  failed.value = false;

  if (props.preview.kind !== "composite") {
    return;
  }

  if (typeof IntersectionObserver === "undefined") {
    drawComposite();
    return;
  }
  observer.value = new IntersectionObserver(
    (entries) => {
      if (entries.every((entry) => !entry.isIntersecting)) {
        return;
      }

      observer.value?.disconnect();
      drawComposite();
    },
    { rootMargin: "200px" },
  );
  if (hostRef.value) observer.value.observe(hostRef.value);
}

onMounted(arm);
watch(previewKey, arm);

onBeforeUnmount(() => {
  drawToken.value++;
  observer.value?.disconnect();
  releaseResult();
});
</script>

<template>
  <div
    ref="hostRef"
    class="relative h-full w-full flex items-center justify-center"
  >
    <NImage
      v-if="displaySrc"
      :src="displaySrc"
      lazy
      object-fit="contain"
      show-toolbar-tooltip
      class="preview-image h-full w-full overflow-hidden"
    />
    <NSpin v-else-if="!failed" size="small" />
    <span v-else class="text-sm text-disabled">预览加载失败</span>
  </div>
</template>

<style scoped>
.preview-image :deep(img) {
  display: block;
  width: 100%;
  height: 100%;
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}
</style>
