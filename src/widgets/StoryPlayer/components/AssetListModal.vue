<script setup lang="ts">
import { computed, ref } from "vue";

import {
  DownloadOutlined as DownloadIcon,
  ImageOutlined as ImageIcon,
  InsertDriveFileOutlined as FileIcon,
} from "@vicons/material";
import { NButton, NIcon, NImage, NModal, NSpace, NTag, NText } from "naive-ui";

import CharacterFacePreview from "./CharacterFacePreview.vue";

import type { StoryCharacterFaceAsset } from "../engine/preload";

const props = defineProps<{
  urls: string[];
  faceAssets: StoryCharacterFaceAsset[];
  /** NModal 的 teleport 目标，全屏播放时需要挂进全屏容器 */
  to?: string | HTMLElement;
}>();
const show = defineModel<boolean>("show");

type AssetKind = "audio" | "image" | "other" | "video";

interface AssetListItem {
  faces: StoryCharacterFaceAsset[];
  kind: AssetKind;
  name: string;
  url: string;
}

interface CharacterFacePreviewInstance {
  exportComposite: () => Promise<Blob>;
}

const selectedCharacterAsset = ref<AssetListItem | null>(null);
const selectedCharacterFace = ref<StoryCharacterFaceAsset | null>(null);
const characterFacePreviewRef = ref<CharacterFacePreviewInstance | null>(null);
const downloadingAsset = ref<"composite" | "face" | null>(null);
const assetDownloadError = ref<string | null>(null);
const showCharacterFaces = ref(false);

function getAssetKind(url: string): AssetKind {
  const normalized = url.split(/[?#]/)[0]?.toLowerCase() ?? "";
  if (
    url.startsWith("data:audio/") ||
    /\.(?:aac|flac|m4a|mp3|oga|ogg|opus|wav|weba)$/.test(normalized)
  )
    return "audio";
  if (
    url.startsWith("data:image/") ||
    /\.(?:avif|bmp|gif|jpe?g|png|svg|webp)$/.test(normalized)
  )
    return "image";
  if (
    url.startsWith("data:video/") ||
    /\.(?:m4v|mkv|mov|mp4|ogv|webm)$/.test(normalized)
  )
    return "video";
  return "other";
}

function getAssetName(url: string, index: number): string {
  if (url.startsWith("data:")) return `内置资源 ${index + 1}`;

  try {
    const pathParts = new URL(url, window.location.href).pathname
      .split("/")
      .filter(Boolean);
    const name = pathParts.at(-1);
    return name ? decodeURIComponent(name) : `资源 ${index + 1}`;
  } catch {
    return `资源 ${index + 1}`;
  }
}

const assetItems = computed<AssetListItem[]>(() =>
  props.urls
    .filter((url) => props.faceAssets.every((face) => face.faceUrl !== url))
    .map((url, index) => {
      const kind = getAssetKind(url);
      return {
        faces: props.faceAssets.filter((face) => face.baseUrl === url),
        kind,
        name: getAssetName(url, index),
        url,
      };
    }),
);

function openCharacterFaces(asset: AssetListItem): void {
  if (asset.faces.length === 0) return;
  selectedCharacterAsset.value = asset;
  selectedCharacterFace.value =
    asset.faces.find((face) => face.used) ?? asset.faces[0] ?? null;
  assetDownloadError.value = null;
  showCharacterFaces.value = true;
}

function selectCharacterFace(face: StoryCharacterFaceAsset): void {
  selectedCharacterFace.value = face;
  assetDownloadError.value = null;
}

function safeFilename(raw: string): string {
  return raw.replace(/[<>:"/\\|?*]/g, "_");
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

async function downloadSelectedComposite(): Promise<void> {
  const face = selectedCharacterFace.value;
  const asset = selectedCharacterAsset.value;
  if (!face || !asset || !characterFacePreviewRef.value) return;

  downloadingAsset.value = "composite";
  assetDownloadError.value = null;
  try {
    const blob = await characterFacePreviewRef.value.exportComposite();
    const baseName = asset.name.replace(/\.[^.]+$/, "");
    saveBlob(blob, `${baseName}_${face.expression}.png`);
  } catch (error) {
    console.error("[story-player] composite download failed:", error);
    assetDownloadError.value = "合成图下载失败";
  } finally {
    downloadingAsset.value = null;
  }
}

async function downloadSelectedFace(): Promise<void> {
  const face = selectedCharacterFace.value;
  if (!face) return;

  downloadingAsset.value = "face";
  assetDownloadError.value = null;
  try {
    const response = await fetch(face.faceUrl);
    if (!response.ok) throw new Error(`failed to fetch ${face.faceUrl}`);
    saveBlob(await response.blob(), getAssetName(face.faceUrl, 0));
  } catch (error) {
    console.error("[story-player] face download failed:", error);
    assetDownloadError.value = "脸部差分下载失败";
  } finally {
    downloadingAsset.value = null;
  }
}
</script>

<template>
  <NModal
    v-model:show="show"
    preset="card"
    title="资源列表"
    :to="to"
    style="width: min(860px, 94vw); max-width: min(860px, 94vw)"
    :bordered="false"
    :auto-focus="false"
  >
    <template #header-extra>
      <NText depth="3" class="text-xs font-normal">
        共 {{ assetItems.length }} 项
      </NText>
    </template>

    <div
      class="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] max-h-[70vh] gap-3 overflow-y-auto p-1"
    >
      <article
        v-for="asset in assetItems"
        :key="asset.url"
        class="asset-card min-w-0 overflow-hidden rounded-xl"
      >
        <div
          v-if="asset.kind === 'image'"
          class="asset-preview asset-preview--transparent flex items-center justify-center"
        >
          <NImage
            :src="asset.url"
            :alt="asset.name"
            lazy
            object-fit="contain"
            show-toolbar-tooltip
            class="asset-image h-full w-full overflow-hidden"
          />
        </div>

        <div
          v-else-if="asset.kind === 'audio'"
          class="asset-preview flex items-center justify-center p-3"
        >
          <audio
            :src="asset.url"
            controls
            preload="none"
            class="block h-10 max-w-full w-full"
          />
        </div>

        <video
          v-else-if="asset.kind === 'video'"
          :src="asset.url"
          controls
          preload="metadata"
          class="asset-preview block h-auto w-full object-contain"
        />

        <a
          v-else
          :href="asset.url"
          target="_blank"
          rel="noopener noreferrer"
          class="asset-preview flex items-center justify-center"
          :aria-label="`打开文件 ${asset.name}`"
        >
          <NIcon size="56"><FileIcon /></NIcon>
        </a>

        <div class="p-3">
          <a
            :href="asset.url"
            target="_blank"
            rel="noopener noreferrer"
            class="line-clamp-2 break-all text-sm font-medium leading-5"
            :title="asset.url"
          >
            {{ asset.name }}
          </a>

          <NButton
            v-if="asset.faces.length > 0"
            class="mt-3 w-full"
            size="small"
            secondary
            @click="openCharacterFaces(asset)"
          >
            <template #icon>
              <NIcon><ImageIcon /></NIcon>
            </template>
            查看表情（{{ asset.faces.length }}）
          </NButton>
        </div>
      </article>
    </div>
  </NModal>

  <NModal
    v-model:show="showCharacterFaces"
    :to="to"
    preset="card"
    :title="`${selectedCharacterAsset?.name ?? '角色'} · 表情预览`"
    style="width: min(1000px, 94vw); max-width: min(1000px, 94vw)"
    :bordered="false"
    :auto-focus="false"
  >
    <template #header-extra>
      <NText depth="3" class="text-xs font-normal">
        共 {{ selectedCharacterAsset?.faces.length ?? 0 }} 项
      </NText>
    </template>

    <div
      v-if="selectedCharacterAsset && selectedCharacterFace"
      class="character-face-browser"
    >
      <section
        class="asset-card min-h-0 min-w-0 flex flex-col overflow-hidden rounded-xl"
      >
        <CharacterFacePreview
          ref="characterFacePreviewRef"
          :base-url="selectedCharacterFace.baseUrl"
          :face-url="selectedCharacterFace.faceUrl"
          :face-rect="selectedCharacterFace.faceRect"
          :label="selectedCharacterFace.expression"
          class="min-h-[280px] flex-1"
        />

        <footer class="face-preview-actions p-3">
          <NSpace :wrap="true">
            <NButton
              size="small"
              type="primary"
              :loading="downloadingAsset === 'composite'"
              :disabled="Boolean(downloadingAsset)"
              @click="downloadSelectedComposite"
            >
              <template #icon>
                <NIcon><DownloadIcon /></NIcon>
              </template>
              下载合成图
            </NButton>
            <NButton
              size="small"
              :loading="downloadingAsset === 'face'"
              :disabled="Boolean(downloadingAsset)"
              @click="downloadSelectedFace"
            >
              <template #icon>
                <NIcon><DownloadIcon /></NIcon>
              </template>
              下载脸部差分
            </NButton>
          </NSpace>
          <NText
            v-if="assetDownloadError"
            type="error"
            class="mt-2 block text-xs"
          >
            {{ assetDownloadError }}
          </NText>
        </footer>
      </section>

      <aside class="character-face-options min-h-0" aria-label="脸部差分">
        <NButton
          v-for="face in selectedCharacterAsset.faces"
          :key="`${face.faceUrl}:${face.expression}`"
          class="character-face-option mb-2 w-full last:mb-0 h-auto! p-2!"
          :type="selectedCharacterFace === face ? 'primary' : 'default'"
          :secondary="selectedCharacterFace === face"
          :disabled="Boolean(downloadingAsset)"
          @click="selectCharacterFace(face)"
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
                class="asset-image h-full w-full overflow-hidden"
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
  </NModal>
</template>

<style scoped>
.asset-card {
  border: 1px solid color-mix(in srgb, currentColor 15%, transparent);
}

.asset-preview {
  width: 100%;
  aspect-ratio: 4 / 3;
  overflow: hidden;
  background: color-mix(in srgb, currentColor 7%, transparent);
}

.asset-preview--transparent {
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

.asset-image :deep(img) {
  display: block;
  width: 100%;
  height: 100%;
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}

.character-face-browser {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 260px;
  gap: 12px;
  height: min(70vh, 680px);
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
