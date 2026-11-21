<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";

import { AkSpinner } from "@mooncellwiki/prts-design-vue";

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
  <div class="character-face-preview">
    <canvas
      v-show="!loading && !error"
      ref="canvasRef"
      role="img"
      :aria-label="label"
    />
    <AkSpinner v-if="loading" variant="bars" label="正在加载合成预览" />
    <p v-else-if="error" class="preview-error" role="status">
      合成预览加载失败
    </p>
  </div>
</template>

<style scoped>
.character-face-preview {
  display: grid;
  place-items: center;
  min-height: 0;
  overflow: hidden;
  background: var(--story-preview-background);
}

.character-face-preview canvas {
  display: block;
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}

.preview-error {
  margin: 0;
  padding-inline: var(--ak-space-3);
  color: var(--ak-fg-muted);
  font-size: var(--ak-fs-sm);
  text-align: center;
}
</style>
