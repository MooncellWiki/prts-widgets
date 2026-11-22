<script setup lang="ts">
import { computed, ref, watch } from "vue";

import {
  AkButton,
  AkButtonGroup,
  AkDialog,
  AkMessage,
  AkSpinner,
} from "@mooncellwiki/prts-design-vue";
import { useElementSize } from "@vueuse/core";

import { downloadAsset } from "./download";

const props = defineProps<{ name: string; url: string }>();
const show = defineModel<boolean>({ default: false });

const viewport = ref<HTMLElement | null>(null);
const { width, height } = useElementSize(viewport);
const source = ref({ width: 0, height: 0 });
const rotation = ref(0);
const zoom = ref<number | null>(null);
const loadError = ref(false);
const downloadError = ref(false);
const downloading = ref(false);

const imageReady = computed(() => source.value.width > 0 && !loadError.value);
const sideways = computed(() => rotation.value % 180 !== 0);
const rotatedSize = computed(() =>
  sideways.value
    ? { width: source.value.height, height: source.value.width }
    : source.value,
);
const fit = computed(() =>
  imageReady.value
    ? Math.min(
        width.value / rotatedSize.value.width,
        height.value / rotatedSize.value.height,
        1,
      )
    : 1,
);
const scale = computed(() => zoom.value ?? fit.value);
const frameSize = computed(() => ({
  width: `${rotatedSize.value.width * scale.value}px`,
  height: `${rotatedSize.value.height * scale.value}px`,
}));
const imageStyle = computed(() => ({
  width: `${source.value.width * scale.value}px`,
  height: `${source.value.height * scale.value}px`,
  transform: `translate(-50%, -50%) rotate(${rotation.value}deg)`,
}));

watch(show, (open) => {
  if (!open) return;
  source.value = { width: 0, height: 0 };
  rotation.value = 0;
  zoom.value = null;
  loadError.value = false;
  downloadError.value = false;
});

function onImageLoad(event: Event): void {
  const image = event.target as HTMLImageElement;
  source.value = { width: image.naturalWidth, height: image.naturalHeight };
}

function resize(factor: number): void {
  if (imageReady.value)
    zoom.value = Math.min(8, Math.max(0.05, scale.value * factor));
}

function toggleOriginalSize(): void {
  if (imageReady.value) zoom.value = zoom.value === 1 ? null : 1;
}

let pan: { x: number; y: number; left: number; top: number } | null = null;

function startPan(event: PointerEvent): void {
  const root = viewport.value;
  if (!root || event.pointerType !== "mouse" || event.button !== 0) return;
  if (
    root.scrollWidth <= root.clientWidth &&
    root.scrollHeight <= root.clientHeight
  )
    return;

  pan = {
    x: event.clientX,
    y: event.clientY,
    left: root.scrollLeft,
    top: root.scrollTop,
  };
  root.setPointerCapture(event.pointerId);
}

function movePan(event: PointerEvent): void {
  if (!pan || !viewport.value) return;
  viewport.value.scrollLeft = pan.left + pan.x - event.clientX;
  viewport.value.scrollTop = pan.top + pan.y - event.clientY;
}

async function downloadImage(): Promise<void> {
  downloading.value = true;
  downloadError.value = false;
  try {
    await downloadAsset(props.url, props.name);
  } catch (error) {
    console.error("[story-player] image download failed:", error);
    downloadError.value = true;
  } finally {
    downloading.value = false;
  }
}
</script>

<template>
  <AkDialog
    v-model="show"
    class="asset-image-dialog"
    size="lg"
    :title="name"
    @keydown.esc.stop
  >
    <div
      v-if="show"
      ref="viewport"
      class="asset-image-viewport"
      role="region"
      aria-label="图片预览"
      tabindex="0"
      @wheel.prevent="resize($event.deltaY < 0 ? 1.12 : 1 / 1.12)"
      @dblclick="toggleOriginalSize"
      @pointerdown="startPan"
      @pointermove="movePan"
      @lostpointercapture="pan = null"
    >
      <div class="asset-image-frame" :style="frameSize">
        <img
          v-show="imageReady"
          :src="url"
          :alt="name"
          :style="imageStyle"
          draggable="false"
          @load="onImageLoad"
          @error="loadError = true"
        />
      </div>
      <AkSpinner
        v-if="!imageReady && !loadError"
        class="asset-image-status"
        description="图片加载中…"
      />
      <AkMessage v-if="loadError" class="asset-image-status" variant="danger"
        >图片加载失败</AkMessage
      >
    </div>
    <AkMessage v-if="downloadError" class="asset-image-error" variant="danger"
      >图片下载失败</AkMessage
    >

    <template #footer>
      <div class="asset-image-actions">
        <AkButtonGroup size="sm">
          <AkButton :disabled="!imageReady" @click="resize(1 / 1.4)"
            >缩小</AkButton
          >
          <AkButton :disabled="!imageReady" @click="resize(1.4)">放大</AkButton>
          <AkButton :disabled="!imageReady" @click="zoom = 1"
            >原始尺寸</AkButton
          >
          <AkButton :disabled="!imageReady" @click="zoom = null"
            >适应窗口</AkButton
          >
        </AkButtonGroup>
        <AkButtonGroup size="sm">
          <AkButton :disabled="!imageReady" @click="rotation -= 90"
            >向左旋转</AkButton
          >
          <AkButton :disabled="!imageReady" @click="rotation += 90"
            >向右旋转</AkButton
          >
        </AkButtonGroup>
        <AkButton
          size="sm"
          variant="contrast"
          icon="download"
          :loading="downloading"
          :disabled="downloading"
          @click="downloadImage"
        >
          下载图片
        </AkButton>
      </div>
    </template>
  </AkDialog>
</template>

<style scoped>
.asset-image-dialog {
  box-sizing: border-box;
  max-width: min(56rem, calc(100vw - 2 * var(--ak-space-3)));
}

.asset-image-dialog :deep(.ak-dialog__title) {
  overflow-wrap: anywhere;
}

.asset-image-viewport {
  position: relative;
  display: flex;
  height: min(52vh, 34rem);
  overflow: auto;
  background: var(--story-preview-background);
}

.asset-image-frame {
  position: relative;
  flex: none;
  margin: auto;
}

.asset-image-frame img {
  position: absolute;
  top: 50%;
  left: 50%;
  max-width: none;
  max-height: none;
}

.asset-image-status {
  position: absolute;
  inset: 0;
  width: max-content;
  height: max-content;
  max-width: 100%;
  margin: auto;
}

.asset-image-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: var(--ak-space-2);
}

.asset-image-error {
  margin-top: var(--ak-space-3);
}
</style>
