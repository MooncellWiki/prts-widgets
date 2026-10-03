<script setup lang="ts">
import { computed, ref } from "vue";

import {
  ImageOutlined as ImageIcon,
  InsertDriveFileOutlined as FileIcon,
} from "@vicons/material";
import { NButton, NIcon, NImage, NModal, NText } from "naive-ui";

import CharacterFaceBrowserModal from "./CharacterFaceBrowserModal.vue";

import type { StoryCharacterFaceAsset } from "../engine/types";

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

const selectedCharacterAsset = ref<AssetListItem | null>(null);
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
  showCharacterFaces.value = true;
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

  <CharacterFaceBrowserModal
    v-model:show="showCharacterFaces"
    :to="to"
    :faces="selectedCharacterAsset?.faces ?? []"
    :filename-base="selectedCharacterAsset?.name ?? '角色'"
    :title="`${selectedCharacterAsset?.name ?? '角色'} · 表情预览`"
  />
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
</style>
