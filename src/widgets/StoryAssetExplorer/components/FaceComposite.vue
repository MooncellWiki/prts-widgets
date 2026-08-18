<script setup lang="ts">
import { ref, watch } from "vue";

import { NSpin, NText } from "naive-ui";

import type { StoryFaceRect } from "../utils";

const props = defineProps<{
  baseUrl: string;
  faceUrl: string;
  faceRect: StoryFaceRect;
  label: string;
}>();

const canvasRef = ref<HTMLCanvasElement | null>(null);
const loading = ref(true);
const error = ref(false);

const drawId = ref(0);

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.addEventListener("load", () => resolve(image), { once: true });
    image.addEventListener(
      "error",
      () => reject(new Error(`failed to load image: ${url}`)),
      { once: true },
    );
    image.src = url;
  });
}

async function drawComposite(): Promise<void> {
  const currentDrawId = drawId.value + 1;
  drawId.value = currentDrawId;
  loading.value = true;
  error.value = false;

  try {
    const [baseImage, faceImage] = await Promise.all([
      loadImage(props.baseUrl),
      loadImage(props.faceUrl),
    ]);
    if (currentDrawId !== drawId.value) return;

    const canvas = canvasRef.value;
    if (!canvas) return;

    const scale = Math.min(
      1,
      720 / Math.max(1, baseImage.naturalWidth),
      720 / Math.max(1, baseImage.naturalHeight),
    );
    canvas.width = Math.max(1, Math.round(baseImage.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(baseImage.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("canvas 2d context is unavailable");

    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(baseImage, 0, 0, canvas.width, canvas.height);
    context.drawImage(
      faceImage,
      props.faceRect.x * scale,
      props.faceRect.y * scale,
      props.faceRect.w * scale,
      props.faceRect.h * scale,
    );
  } catch {
    if (currentDrawId !== drawId.value) return;
    error.value = true;
  } finally {
    if (currentDrawId === drawId.value) loading.value = false;
  }
}

watch(
  () => [
    props.baseUrl,
    props.faceUrl,
    props.faceRect.x,
    props.faceRect.y,
    props.faceRect.w,
    props.faceRect.h,
  ],
  () => {
    drawComposite();
  },
  { immediate: true },
);
</script>

<template>
  <div
    class="face-composite relative h-full w-full flex items-center justify-center overflow-hidden"
  >
    <canvas
      v-show="!loading && !error"
      ref="canvasRef"
      class="block max-h-full max-w-full"
      role="img"
      :aria-label="label"
    />
    <NSpin v-if="loading" size="small" />
    <NText v-else-if="error" depth="3" class="px-3 text-center text-xs">
      合成预览加载失败
    </NText>
  </div>
</template>

<style scoped>
.face-composite {
  background-color: #f4f4f4;
  background-image:
    linear-gradient(45deg, #d8d8d8 25%, transparent 25%),
    linear-gradient(-45deg, #d8d8d8 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, #d8d8d8 75%),
    linear-gradient(-45deg, transparent 75%, #d8d8d8 75%);
  background-position:
    0 0,
    0 8px,
    8px -8px,
    -8px 0;
  background-size: 16px 16px;
}
</style>
