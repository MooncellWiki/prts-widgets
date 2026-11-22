<script setup lang="ts">
import { ref, watch } from "vue";

import {
  AkButton,
  AkDialog,
  AkEmpty,
  AkMessage,
  AkTag,
} from "@mooncellwiki/prts-design-vue";

import CharacterFacePreview from "./CharacterFacePreview.vue";
import { downloadAsset, saveBlob } from "./download";

import type { StoryCharacterFaceAsset } from "../engine/types";

const props = defineProps<{
  faces: readonly StoryCharacterFaceAsset[];
  filenameBase: string;
  title: string;
}>();
const show = defineModel<boolean>("show", { default: false });

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
    downloadError.value = null;
  },
  { immediate: true },
);

function selectFace(face: StoryCharacterFaceAsset): void {
  selectedFace.value = face;
  downloadError.value = null;
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

async function downloadComposite(): Promise<void> {
  const face = selectedFace.value;
  if (!face || !previewRef.value) return;

  const baseName = props.filenameBase.replace(/\.[^.]+$/, "");
  const filename = `${baseName}_${face.expression}.png`;
  downloading.value = "composite";
  downloadError.value = null;
  try {
    const blob = await previewRef.value.exportComposite();
    saveBlob(blob, filename);
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
    await downloadAsset(face.faceUrl, filenameFromUrl(face.faceUrl));
  } catch (error) {
    console.error("[character-face-browser] face download failed:", error);
    downloadError.value = "脸部差分下载失败";
  } finally {
    downloading.value = null;
  }
}
</script>

<template>
  <AkDialog
    v-model="show"
    class="character-face-dialog"
    size="lg"
    :title="title"
    @keydown.esc.stop
  >
    <template v-if="show">
      <div v-if="selectedFace" class="character-face-browser">
        <section class="character-face-stage" aria-label="合成预览">
          <CharacterFacePreview
            ref="previewRef"
            :base-url="selectedFace.baseUrl"
            :face-url="selectedFace.faceUrl"
            :face-rect="selectedFace.faceRect"
            :label="selectedFace.expression"
            class="character-face-canvas"
          />

          <footer class="face-preview-actions">
            <strong class="face-preview-name">{{
              selectedFace.expression
            }}</strong>
            <div class="face-downloads">
              <AkButton
                size="sm"
                variant="contrast"
                icon="download"
                :loading="downloading === 'composite'"
                :disabled="Boolean(downloading)"
                @click="downloadComposite"
              >
                下载合成图
              </AkButton>
              <AkButton
                size="sm"
                icon="download"
                :loading="downloading === 'face'"
                :disabled="Boolean(downloading)"
                @click="downloadFace"
              >
                下载脸部差分
              </AkButton>
            </div>
            <AkMessage v-if="downloadError" variant="danger">{{
              downloadError
            }}</AkMessage>
          </footer>
        </section>

        <aside class="character-face-options" aria-label="脸部差分">
          <AkButton
            v-for="face in faces"
            :key="`${face.baseUrl}:${face.faceUrl}:${face.expression}`"
            class="character-face-option"
            :variant="selectedFace === face ? 'outline' : 'default'"
            :aria-pressed="selectedFace === face"
            :disabled="Boolean(downloading)"
            @click="selectFace(face)"
          >
            <img
              :src="face.faceUrl"
              alt=""
              loading="lazy"
              decoding="async"
              class="face-option-thumbnail"
            />
            <span class="face-option-label">
              {{ face.expression }}
              <AkTag v-if="face.used" size="sm" variant="accent-soft"
                >剧情使用</AkTag
              >
            </span>
          </AkButton>
        </aside>
      </div>
      <AkEmpty v-else title="没有可展示的表情差分" />
    </template>
  </AkDialog>
</template>

<style scoped>
.character-face-dialog {
  box-sizing: border-box;
  max-width: min(60rem, calc(100vw - 2 * var(--ak-space-3)));
}

.character-face-dialog :deep(.ak-dialog__title) {
  overflow-wrap: anywhere;
}

.character-face-dialog :deep(.ak-dialog__body) {
  container-type: inline-size;
}

.character-face-browser {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(10rem, 16rem);
  gap: var(--ak-space-3);
  height: min(60vh, 38rem);
}

.character-face-stage {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  border: 1px solid var(--ak-border);
}

.character-face-canvas {
  flex: 1;
}

.character-face-options {
  display: flex;
  flex-direction: column;
  gap: var(--ak-space-2);
  min-width: 0;
  overflow-y: auto;
  padding: 2px;
}

.face-preview-actions {
  display: grid;
  gap: var(--ak-space-2);
  padding: var(--ak-space-3);
  border-top: 1px solid var(--ak-border);
  background: var(--ak-bg-surface-2);
}

.face-preview-name {
  overflow-wrap: anywhere;
}

.face-downloads {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ak-space-2);
}

.character-face-option {
  flex: none;
  justify-content: flex-start;
  min-width: 0;
  padding: var(--ak-space-2);
  text-align: start;
  white-space: normal;
}

.face-option-thumbnail {
  flex: 0 0 3rem;
  width: 3rem;
  height: 3rem;
  object-fit: contain;
  background: var(--story-preview-background);
}

.face-option-label {
  display: grid;
  gap: var(--ak-space-1);
  min-width: 0;
  justify-items: start;
  overflow-wrap: anywhere;
}

@container (max-width: 38rem) {
  .character-face-browser {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: minmax(14rem, 40vh) auto;
    height: auto;
  }

  .character-face-options {
    flex-direction: row;
    overflow: auto;
  }

  .character-face-option {
    flex-basis: 9rem;
  }
}
</style>
