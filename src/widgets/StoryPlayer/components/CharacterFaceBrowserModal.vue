<script setup lang="ts">
import { ref, watch } from "vue";

import { DownloadOutlined as DownloadIcon } from "@vicons/material";
import { NButton, NIcon, NImage, NModal, NSpace, NTag, NText } from "naive-ui";

import CharacterFacePreview from "./CharacterFacePreview.vue";

import type { StoryCharacterFaceAsset } from "../engine/types";

const props = defineProps<{
  faces: readonly StoryCharacterFaceAsset[];
  filenameBase: string;
  title: string;
  /** NModal 的 teleport 目标，全屏播放时需要挂进全屏容器 */
  to?: string | HTMLElement;
}>();
const show = defineModel<boolean>("show");

interface CharacterFacePreviewInstance {
  exportComposite: () => Promise<Blob>;
}

const selectedFace = ref<StoryCharacterFaceAsset | null>(null);
const previewRef = ref<CharacterFacePreviewInstance | null>(null);
const downloading = ref<"composite" | "face" | null>(null);
const downloadError = ref<string | null>(null);

watch(
  [show, () => props.faces],
  ([visible, faces]) => {
    if (!visible) return;
    selectedFace.value = faces.find((face) => face.used) ?? faces[0] ?? null;
    downloading.value = null;
    downloadError.value = null;
  },
  { immediate: true },
);

function selectFace(face: StoryCharacterFaceAsset): void {
  selectedFace.value = face;
  downloadError.value = null;
}

function safeFilename(raw: string): string {
  return raw.replace(/[<>:"/\\|?*]/g, "_");
}

function filenameFromUrl(url: string): string {
  try {
    const name = new URL(url, window.location.href).pathname
      .split("/")
      .findLast((part) => part.length > 0);
    if (name) return decodeURIComponent(name);
  } catch {
    // Fall through to the expression-based name below.
  }
  return `${selectedFace.value?.expression ?? "face"}.png`;
}

function saveBlob(blob: Blob, filename: string): void {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = safeFilename(filename);
  anchor.style.display = "none";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

async function downloadComposite(): Promise<void> {
  const face = selectedFace.value;
  if (!face || !previewRef.value) return;

  downloading.value = "composite";
  downloadError.value = null;
  try {
    const blob = await previewRef.value.exportComposite();
    const baseName = props.filenameBase.replace(/\.[^.]+$/, "");
    saveBlob(blob, `${baseName}_${face.expression}.png`);
  } catch (error) {
    console.error("[character-face-browser] composite download failed:", error);
    downloadError.value = "合成图下载失败";
  } finally {
    downloading.value = null;
  }
}

async function downloadFace(): Promise<void> {
  const face = selectedFace.value;
  if (!face) return;

  downloading.value = "face";
  downloadError.value = null;
  try {
    const response = await fetch(face.faceUrl);
    if (!response.ok) throw new Error(`failed to fetch ${face.faceUrl}`);
    saveBlob(await response.blob(), filenameFromUrl(face.faceUrl));
  } catch (error) {
    console.error("[character-face-browser] face download failed:", error);
    downloadError.value = "脸部差分下载失败";
  } finally {
    downloading.value = null;
  }
}
</script>

<template>
  <NModal
    v-model:show="show"
    :to="to"
    preset="card"
    :title="title"
    style="width: min(1000px, 94vw); max-width: min(1000px, 94vw)"
    :bordered="false"
    :auto-focus="false"
  >
    <template #header-extra>
      <NText depth="3" class="text-xs font-normal">
        共 {{ faces.length }} 项
      </NText>
    </template>

    <div v-if="selectedFace" class="character-face-browser">
      <section
        class="character-face-stage min-h-0 min-w-0 flex flex-col overflow-hidden rounded-xl"
      >
        <CharacterFacePreview
          ref="previewRef"
          :base-url="selectedFace.baseUrl"
          :face-url="selectedFace.faceUrl"
          :face-rect="selectedFace.faceRect"
          :label="selectedFace.expression"
          class="min-h-[280px] flex-1"
        />

        <footer class="face-preview-actions p-3">
          <div class="mb-2 break-all text-sm">
            {{ selectedFace.expression }}
          </div>
          <NSpace :wrap="true">
            <NButton
              size="small"
              type="primary"
              :loading="downloading === 'composite'"
              :disabled="Boolean(downloading)"
              @click="downloadComposite"
            >
              <template #icon>
                <NIcon><DownloadIcon /></NIcon>
              </template>
              下载合成图
            </NButton>
            <NButton
              size="small"
              :loading="downloading === 'face'"
              :disabled="Boolean(downloading)"
              @click="downloadFace"
            >
              <template #icon>
                <NIcon><DownloadIcon /></NIcon>
              </template>
              下载脸部差分
            </NButton>
          </NSpace>
          <NText v-if="downloadError" type="error" class="mt-2 block text-xs">
            {{ downloadError }}
          </NText>
        </footer>
      </section>

      <aside class="character-face-options min-h-0" aria-label="脸部差分">
        <NButton
          v-for="face in faces"
          :key="`${face.baseUrl}:${face.faceUrl}:${face.expression}`"
          class="character-face-option mb-2 w-full last:mb-0 h-auto! p-2!"
          :type="selectedFace === face ? 'primary' : 'default'"
          :secondary="selectedFace === face"
          :disabled="Boolean(downloading)"
          @click="selectFace(face)"
        >
          <div class="min-w-0 w-full flex items-center gap-2 text-left">
            <div
              class="face-option-thumbnail h-12 w-12 flex-none overflow-hidden rounded-md"
            >
              <NImage
                :src="face.faceUrl"
                :alt="face.expression"
                object-fit="contain"
                preview-disabled
                class="face-option-image h-full w-full overflow-hidden"
              />
            </div>
            <div class="min-w-0 flex-1 break-all text-sm">
              <div>{{ face.expression }}</div>
              <NTag
                v-if="face.used"
                class="mt-1 block w-fit"
                size="tiny"
                type="success"
                :bordered="false"
              >
                剧情使用
              </NTag>
            </div>
          </div>
        </NButton>
      </aside>
    </div>
    <div v-else class="text-disabled">没有可展示的表情差分</div>
  </NModal>
</template>

<style scoped>
.character-face-browser {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 260px;
  gap: 12px;
  height: min(70vh, 680px);
}

.character-face-stage {
  border: 1px solid color-mix(in srgb, currentColor 15%, transparent);
}

.character-face-options {
  overflow-y: auto;
  padding-right: 4px;
}

.face-preview-actions {
  border-top: 1px solid color-mix(in srgb, currentColor 15%, transparent);
}

.face-option-thumbnail {
  background-color: #f4f4f4;
  background-image:
    linear-gradient(45deg, #d8d8d8 25%, transparent 25%),
    linear-gradient(-45deg, #d8d8d8 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, #d8d8d8 75%),
    linear-gradient(-45deg, transparent 75%, #d8d8d8 75%);
  background-position:
    0 0,
    0 6px,
    6px -6px,
    -6px 0;
  background-size: 12px 12px;
}

.face-option-image :deep(img) {
  display: block;
  width: 100%;
  height: 100%;
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}

@media (max-width: 700px) {
  .character-face-browser {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: minmax(320px, 55vh) auto;
    height: auto;
  }

  .character-face-options {
    display: flex;
    gap: 8px;
    overflow-x: auto;
    padding: 0 0 4px;
  }

  .character-face-option {
    flex: 0 0 180px;
    margin-bottom: 0;
  }
}
</style>
