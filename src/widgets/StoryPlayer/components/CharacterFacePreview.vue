<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";

import { NSpin, NText } from "naive-ui";

import type { StoryFaceRect } from "../engine/types";

const props = defineProps<{
  baseUrl: string;
  faceUrl: string;
  faceRect: StoryFaceRect;
  label: string;
}>();

const canvasRef = ref<HTMLCanvasElement | null>(null);
const error = ref(false);
const loading = ref(true);

let drawId = 0;
let stopWatch: (() => void) | null = null;

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

async function loadDownloadImage(
  url: string,
): Promise<{ image: HTMLImageElement; objectUrl: string }> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`failed to fetch image: ${url}`);

  const objectUrl = URL.createObjectURL(await response.blob());
  try {
    return { image: await loadImage(objectUrl), objectUrl };
  } catch (error) {
    URL.revokeObjectURL(objectUrl);
    throw error;
  }
}

function canvasAsPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("failed to encode character preview"));
    }, "image/png");
  });
}

async function exportComposite(): Promise<Blob> {
  const baseUrl = props.baseUrl;
  const faceUrl = props.faceUrl;
  const faceRect = { ...props.faceRect };
  const baseSource = await loadDownloadImage(baseUrl);
  let faceSource: Awaited<ReturnType<typeof loadDownloadImage>> | null = null;

  try {
    faceSource = await loadDownloadImage(faceUrl);
    const canvas = document.createElement("canvas");
    canvas.width = baseSource.image.naturalWidth;
    canvas.height = baseSource.image.naturalHeight;
    const drawingContext = canvas.getContext("2d");
    if (!drawingContext) throw new Error("canvas 2d context is unavailable");

    drawingContext.drawImage(baseSource.image, 0, 0);
    drawingContext.drawImage(
      faceSource.image,
      faceRect.x,
      faceRect.y,
      faceRect.w,
      faceRect.h,
    );
    return await canvasAsPng(canvas);
  } finally {
    URL.revokeObjectURL(baseSource.objectUrl);
    if (faceSource) URL.revokeObjectURL(faceSource.objectUrl);
  }
}

defineExpose({ exportComposite });

async function drawComposite(): Promise<void> {
  const currentDrawId = ++drawId;
  loading.value = true;
  error.value = false;

  try {
    const [baseImage, faceImage] = await Promise.all([
      loadImage(props.baseUrl),
      loadImage(props.faceUrl),
    ]);
    if (currentDrawId !== drawId) return;

    const canvas = canvasRef.value;
    if (!canvas) return;

    const sourceWidth = baseImage.naturalWidth;
    const sourceHeight = baseImage.naturalHeight;
    const maxDimension = 720;
    const scale = Math.min(
      1,
      maxDimension / Math.max(1, sourceWidth),
      maxDimension / Math.max(1, sourceHeight),
    );
    canvas.width = Math.max(1, Math.round(sourceWidth * scale));
    canvas.height = Math.max(1, Math.round(sourceHeight * scale));

    const drawingContext = canvas.getContext("2d");
    if (!drawingContext) throw new Error("canvas 2d context is unavailable");

    drawingContext.clearRect(0, 0, canvas.width, canvas.height);
    drawingContext.drawImage(baseImage, 0, 0, canvas.width, canvas.height);
    drawingContext.drawImage(
      faceImage,
      props.faceRect.x * scale,
      props.faceRect.y * scale,
      props.faceRect.w * scale,
      props.faceRect.h * scale,
    );
  } catch {
    if (currentDrawId !== drawId) return;
    error.value = true;
  } finally {
    if (currentDrawId === drawId) loading.value = false;
  }
}

onMounted(() => {
  stopWatch = watch(
    () => [
      props.baseUrl,
      props.faceUrl,
      props.faceRect.x,
      props.faceRect.y,
      props.faceRect.w,
      props.faceRect.h,
    ],
    () => {
      drawComposite().catch(() => {
        error.value = true;
        loading.value = false;
      });
    },
    { immediate: true },
  );
});

onBeforeUnmount(() => {
  drawId += 1;
  stopWatch?.();
});
</script>

<template>
  <div
    class="character-face-preview relative min-h-0 w-full flex items-center justify-center overflow-hidden"
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
.character-face-preview {
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
