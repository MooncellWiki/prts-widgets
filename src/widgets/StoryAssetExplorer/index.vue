<script setup lang="ts">
import { computed, onMounted, ref, watchEffect } from "vue";

import { ImageOutlined as ImageIcon } from "@vicons/material";
import {
  NButton,
  NConfigProvider,
  NIcon,
  NImage,
  NInput,
  NLayout,
  NModal,
  NSelect,
  NSkeleton,
  NTag,
  NText,
} from "naive-ui";

import { TORAPPU_ENDPOINT } from "@/utils/consts";
import { useTheme } from "@/utils/theme";

import CharacterFaceBrowserModal from "../StoryPlayer/components/CharacterFaceBrowserModal.vue";

import CharacterPreview from "./components/CharacterPreview.vue";
import {
  type CargoStoryRow,
  type CharacterLinkMap,
  type CharacterPreview as CharacterPreviewInfo,
  type StoryResourceListResponse,
  type StoryResourceSummary,
  type StoryResourceType,
  type StoryUsageItem,
  type StoryUsageResponse,
  CARGO_IN_CHUNK,
  CARGO_ROW_LIMIT,
  MAX_PAGES,
  PAGE_LIMIT,
  RESOURCE_TYPE_OPTIONS,
  buildFaceGallery,
  cargoTextPathIn,
  chunk,
  ensureCharacterMap,
  resolveCharacterPreview,
  resourceTypeLabel,
  storyResourceImageUrl,
} from "./utils";

import type { StoryCharacterFaceAsset } from "../StoryPlayer/engine/types";

enum Status {
  idle,
  loading,
  fail,
  succ,
}

interface ResultRow extends StoryUsageItem {
  story?: CargoStoryRow;
}

interface ResourceCard extends StoryResourceSummary {
  imageUrl: string | null;
  thumbnailUrl: string | undefined;
  character: CharacterPreviewInfo | null;
}

interface ResourceSearchCriteria {
  type: string;
  query: string;
}

const TYPE_SELECT_OPTIONS: { label: string; value: string }[] = [
  { label: "全部类型", value: "" },
  ...RESOURCE_TYPE_OPTIONS,
];

// 阿里云 CDN 图片处理：卡片预览区最小 220px 宽（4:3），最长边 480 覆盖 2x DPR；
// CDN 缩放只缩不放，小于该尺寸的原图不受影响
const WEBP_PROBE_SRC =
  "data:image/webp;base64,UklGRh4AAABXRUJQVlA4TBEAAAAvAAAAAAfQ//73v/+BiOh/AAA=";
const supportsWebp = ref(false);

function detectWebpSupport(): Promise<boolean> {
  return new Promise((resolve) => {
    const image = new Image();
    image.addEventListener("load", () => resolve(true));
    image.addEventListener("error", () => resolve(false));
    image.src = WEBP_PROBE_SRC;
  });
}

// setup 时立即探测，让结果赶在首屏卡片渲染（需等搜索接口返回）前就绪，避免图片二次加载
detectWebpSupport().then((supported) => {
  supportsWebp.value = supported;
});

const thumbnailQuery = computed(() => {
  const operations = ["resize,l_480"];
  if (supportsWebp.value) operations.push("format,webp");
  return `image_process=${operations.join("/")}`;
});

const props = defineProps<{
  type?: string;
  id?: string;
}>();

const { theme, themeOverrides, isDark } = useTheme();

const resourceType = ref(
  RESOURCE_TYPE_OPTIONS.some((option) => option.value === props.type)
    ? (props.type as StoryResourceType)
    : "",
);
const resourceQuery = ref(props.id ?? "");
const status = ref(Status.idle);
const errorMessage = ref("");
const resources = ref<StoryResourceSummary[]>([]);
const nextCursor = ref<string | null>(null);
const loadingMore = ref(false);
const loadMoreError = ref("");
const activeResourceSearch = ref<ResourceSearchCriteria | null>(null);
const resourceSearchGeneration = ref(0);

const showDetail = ref(false);
const detailResource = ref<StoryResourceSummary | null>(null);
const detailGeneration = ref(0);
const detailStatus = ref(Status.idle);
const detailError = ref("");
const detailRows = ref<ResultRow[]>([]);
const matchedCount = ref(0);
const detailTruncated = ref("");

const showFaces = ref(false);
const faceItems = ref<StoryCharacterFaceAsset[]>([]);

const detailTitle = computed(() =>
  detailResource.value
    ? `${resourceTypeLabel(detailResource.value.type)} · ${detailResource.value.id}`
    : "使用详情",
);

const characterLinks = ref<CharacterLinkMap | null>(null);
const characterMapFailed = ref(false);

watchEffect(() => {
  // 失败后先停下，避免每次渲染重试 1.3MB 的请求；下一次搜索会解除。
  if (characterLinks.value || characterMapFailed.value) return;
  if (resources.value.every((resource) => resource.type !== "character")) {
    return;
  }
  ensureCharacterMap()
    .then((map) => {
      characterLinks.value = map;
    })
    .catch((error) => {
      console.warn(error);
      characterMapFailed.value = true;
    });
});

const cards = computed<ResourceCard[]>(() =>
  resources.value.map((resource) => {
    const imageUrl = storyResourceImageUrl(resource.type, resource.id);
    return {
      ...resource,
      imageUrl,
      thumbnailUrl: imageUrl
        ? `${imageUrl}?${thumbnailQuery.value}`
        : undefined,
      character:
        resource.type === "character"
          ? resolveCharacterPreview(
              resource.id,
              characterLinks.value ?? new Map(),
            )
          : null,
    };
  }),
);

async function fetchResourcePage(
  criteria: ResourceSearchCriteria,
  cursor?: string | null,
): Promise<StoryResourceListResponse> {
  const params = new URLSearchParams({ limit: String(PAGE_LIMIT) });
  if (criteria.type) params.set("type", criteria.type);
  if (criteria.query) params.set("q", criteria.query);
  if (cursor) params.set("cursor", cursor);
  const resp = await fetch(
    `${TORAPPU_ENDPOINT}/api/v1/story-resources?${params}`,
  );
  if (!resp.ok) {
    throw new Error(`story-resources ${resp.status}`);
  }
  return (await resp.json()) as StoryResourceListResponse;
}

async function search(): Promise<void> {
  resourceSearchGeneration.value += 1;
  const generation = resourceSearchGeneration.value;
  const criteria: ResourceSearchCriteria = {
    type: resourceType.value,
    query: resourceQuery.value.trim(),
  };
  status.value = Status.loading;
  errorMessage.value = "";
  loadMoreError.value = "";
  characterMapFailed.value = false;
  try {
    const data = await fetchResourcePage(criteria);
    if (generation !== resourceSearchGeneration.value) return;
    resources.value = data.resources;
    nextCursor.value = data.nextCursor ?? null;
    activeResourceSearch.value = criteria;
    status.value = Status.succ;
  } catch (error) {
    if (generation !== resourceSearchGeneration.value) return;
    console.warn(error);
    errorMessage.value = error instanceof Error ? error.message : String(error);
    status.value = Status.fail;
  }
}

async function loadMore(): Promise<void> {
  const cursor = nextCursor.value;
  const criteria = activeResourceSearch.value;
  if (!cursor || !criteria || loadingMore.value) return;
  const generation = resourceSearchGeneration.value;
  loadingMore.value = true;
  loadMoreError.value = "";
  try {
    const data = await fetchResourcePage(criteria, cursor);
    if (generation !== resourceSearchGeneration.value) return;
    resources.value.push(...data.resources);
    nextCursor.value = data.nextCursor ?? null;
  } catch (error) {
    if (generation !== resourceSearchGeneration.value) return;
    console.warn(error);
    loadMoreError.value =
      error instanceof Error ? error.message : String(error);
  } finally {
    loadingMore.value = false;
  }
}

async function fetchUsageItems(
  type: StoryResourceType,
  id: string,
): Promise<{ items: StoryUsageItem[]; truncated: boolean }> {
  const items: StoryUsageItem[] = [];
  let cursor: string | null | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const params = new URLSearchParams({
      type,
      id,
      limit: String(PAGE_LIMIT),
    });
    if (cursor) params.set("cursor", cursor);
    const resp = await fetch(
      `${TORAPPU_ENDPOINT}/api/v1/story-resource-usages?${params}`,
    );
    if (!resp.ok) {
      throw new Error(`story-resource-usages ${resp.status}`);
    }
    const data = (await resp.json()) as StoryUsageResponse;
    items.push(...data.usages);
    cursor = data.nextCursor;
    if (!cursor) return { items, truncated: false };
  }
  // 翻页保护兜底：还有 cursor 说明结果被截断，得让用户知道列表不全。
  return { items, truncated: true };
}

async function fetchCargoStories(
  paths: string[],
): Promise<{ map: Map<string, CargoStoryRow>; truncated: boolean }> {
  const map = new Map<string, CargoStoryRow>();
  let truncated = false;
  for (const group of chunk(paths, CARGO_IN_CHUNK)) {
    const params = new URLSearchParams({
      action: "cargoquery",
      format: "json",
      tables: "story",
      fields: "_pageName=page,textPath,storyType,storyGroup",
      where: cargoTextPathIn(group),
      limit: String(CARGO_ROW_LIMIT),
    });
    const resp = await fetch(`/api.php?${params}`);
    if (!resp.ok) {
      throw new Error(`cargoquery ${resp.status}`);
    }
    // MediaWiki 出错时照样回 200，错误放在 error 字段里；不查的话整表会静默
    // 变成「未收录」。
    const json = (await resp.json()) as {
      cargoquery?: { title: CargoStoryRow }[];
      error?: { code?: string; info?: string };
    };
    if (json.error) {
      throw new Error(
        `cargoquery ${json.error.code ?? "error"}: ${json.error.info ?? ""}`,
      );
    }
    const rows = json.cargoquery ?? [];
    // 取满上限说明这一批可能还有没返回的行。
    if (rows.length >= CARGO_ROW_LIMIT) truncated = true;
    for (const { title } of rows) {
      if (!map.has(title.textPath)) {
        map.set(title.textPath, title);
      }
    }
  }
  return { map, truncated };
}

/** 两处静默截断都得让用户看见，否则「就这么多」和「被截断了」长得一样。 */
function truncationNotice(usagesTruncated: boolean, cargoTruncated: boolean) {
  if (usagesTruncated)
    return `使用记录超过 ${MAX_PAGES * PAGE_LIMIT} 条，列表已截断`;
  if (cargoTruncated) return "cargo 查询取满了结果上限，剧情页面关联可能不全";
  return "";
}

async function queryDetail(): Promise<void> {
  const resource = detailResource.value;
  if (!resource) return;
  // 详情要打两轮网络请求（分页的 usages + 分批的 cargo），连续打开两个资源时
  // 先发的响应可能后到，覆盖掉当前资源的表格。
  detailGeneration.value += 1;
  const generation = detailGeneration.value;
  detailStatus.value = Status.loading;
  detailError.value = "";
  detailTruncated.value = "";
  try {
    const usages = await fetchUsageItems(resource.type, resource.id);
    const stories = await fetchCargoStories(
      usages.items.map((item) => item.scriptPath),
    );
    if (generation !== detailGeneration.value) return;
    detailRows.value = usages.items.map((item) => ({
      ...item,
      story: stories.map.get(item.scriptPath),
    }));
    matchedCount.value = detailRows.value.filter((row) => row.story).length;
    detailTruncated.value = truncationNotice(
      usages.truncated,
      stories.truncated,
    );
    detailStatus.value = Status.succ;
  } catch (error) {
    if (generation !== detailGeneration.value) return;
    console.warn(error);
    detailError.value = error instanceof Error ? error.message : String(error);
    detailStatus.value = Status.fail;
  }
}

function openDetail(resource: StoryResourceSummary): void {
  detailResource.value = resource;
  showDetail.value = true;
  queryDetail();
}

function openFaces(row: ResultRow): void {
  const resource = detailResource.value;
  if (!resource || !row.faces || row.faces.length === 0) return;
  const gallery = buildFaceGallery(
    resource.id,
    row.faces,
    characterLinks.value ?? new Map(),
  );
  if (!gallery || gallery.length === 0) return;

  faceItems.value = gallery;
  showFaces.value = true;
}

onMounted(() => {
  search();
});
</script>

<template>
  <NConfigProvider
    preflight-style-disabled
    :breakpoints="{ s: 640, m: 768, lg: 1024, xl: 1280, xxl: 1536 }"
    :theme="theme"
    :theme-overrides="themeOverrides"
  >
    <NLayout :class="['mx-auto p-2 antialiased', isDark && 'prts-widget-dark']">
      <form class="mb-3 flex items-center gap-2" @submit.prevent="search">
        <NSelect
          v-model:value="resourceType"
          :options="TYPE_SELECT_OPTIONS"
          class="w-28 shrink-0"
        />
        <NInput
          v-model:value="resourceQuery"
          class="min-w-0 flex-1"
          placeholder="资源 ID 关键字，如 bg_indoor_2 / avg_npc_009，留空显示全部"
          clearable
          @keyup.enter="search"
        />
        <NButton
          type="primary"
          class="shrink-0"
          :loading="status === Status.loading"
          @click="search"
        >
          搜索
        </NButton>
      </form>

      <NButton v-if="status === Status.fail" @click="search">
        加载失败（{{ errorMessage }}） 点击重试
      </NButton>
      <NSkeleton v-else-if="status === Status.loading" :repeat="6" />
      <template v-else-if="status === Status.succ">
        <div v-if="cards.length === 0" class="text-disabled">
          没有匹配的资源
        </div>
        <template v-else>
          <div
            class="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3"
          >
            <article
              v-for="card in cards"
              :key="`${card.type}:${card.id}`"
              class="asset-card min-w-0 flex flex-col overflow-hidden rounded-xl"
            >
              <div
                class="asset-preview asset-preview--transparent flex items-center justify-center"
              >
                <NImage
                  v-if="card.imageUrl"
                  :src="card.thumbnailUrl"
                  :preview-src="card.imageUrl"
                  :alt="card.id"
                  lazy
                  object-fit="contain"
                  show-toolbar-tooltip
                  class="asset-image h-full w-full overflow-hidden"
                />
                <CharacterPreview
                  v-else-if="card.character"
                  :preview="card.character"
                  class="h-full w-full"
                />
                <NIcon v-else size="48" :depth="3">
                  <ImageIcon />
                </NIcon>
              </div>
              <footer class="p-3">
                <div class="flex items-center justify-between gap-2">
                  <NTag size="small" :bordered="false">
                    {{ resourceTypeLabel(card.type) }}
                  </NTag>
                  <span class="whitespace-nowrap text-xs text-disabled">
                    {{ card.scriptCount }} 个剧本
                  </span>
                </div>
                <code
                  class="mt-2 block break-all text-sm font-medium leading-5"
                >
                  {{ card.id }}
                </code>
                <NButton
                  class="mt-3 w-full"
                  size="small"
                  secondary
                  @click="openDetail(card)"
                >
                  查看使用
                </NButton>
              </footer>
            </article>
          </div>
          <div v-if="nextCursor" class="mt-3 flex flex-col items-center gap-1">
            <NButton secondary :loading="loadingMore" @click="loadMore">
              加载更多（已加载 {{ cards.length }} 项）
            </NButton>
            <span v-if="loadMoreError" class="text-xs text-red">
              加载更多失败（{{ loadMoreError }}），请重试
            </span>
          </div>
        </template>
      </template>

      <NModal
        v-model:show="showDetail"
        preset="card"
        :title="detailTitle"
        style="width: min(1000px, 94vw); max-width: min(1000px, 94vw)"
        :bordered="false"
        :auto-focus="false"
        :block-scroll="false"
      >
        <template #header-extra>
          <NText depth="3" class="text-xs font-normal">
            共 {{ detailRows.length }} 条结果
          </NText>
        </template>

        <NButton
          v-if="detailStatus === Status.fail"
          class="w-full"
          @click="queryDetail"
        >
          加载失败（{{ detailError }}） 点击重试
        </NButton>
        <NSkeleton v-else-if="detailStatus === Status.loading" :repeat="4" />
        <template v-else-if="detailStatus === Status.succ">
          <div v-if="detailRows.length === 0" class="text-disabled">
            没有剧情文本使用 {{ detailResource?.id }}
          </div>
          <template v-else>
            <div class="mb-2 text-sm">{{ matchedCount }} 条已关联剧情页面</div>
            <div v-if="detailTruncated" class="mb-2 text-xs text-red">
              {{ detailTruncated }}
            </div>
            <div class="max-h-[70vh] overflow-x-auto">
              <table class="w-full border-collapse text-left">
                <thead>
                  <tr>
                    <th
                      v-if="detailResource?.type === 'character'"
                      class="border border-divider px-2 py-1"
                    >
                      显示名
                    </th>
                    <th
                      v-if="detailResource?.type === 'character'"
                      class="border border-divider px-2 py-1"
                    >
                      表情
                    </th>
                    <th class="border border-divider px-2 py-1">分类</th>
                    <th class="border border-divider px-2 py-1">所属</th>
                    <th class="border border-divider px-2 py-1">剧情页面</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="row in detailRows" :key="row.scriptPath">
                    <td
                      v-if="detailResource?.type === 'character'"
                      class="border border-divider px-2 py-1"
                    >
                      {{ row.displayNames.join("、") }}
                    </td>
                    <td
                      v-if="detailResource?.type === 'character'"
                      class="border border-divider px-2 py-1"
                    >
                      <NButton
                        v-if="row.faces && row.faces.length > 0"
                        size="tiny"
                        secondary
                        @click="openFaces(row)"
                      >
                        表情（{{ row.faces.length }}）
                      </NButton>
                      <span v-else class="text-disabled">-</span>
                    </td>
                    <td class="border border-divider px-2 py-1">
                      {{ row.story?.storyType ?? "-" }}
                    </td>
                    <td class="border border-divider px-2 py-1">
                      {{ row.story?.storyGroup ?? "-" }}
                    </td>
                    <td
                      class="border border-divider px-2 py-1"
                      :title="row.scriptPath"
                    >
                      <a
                        v-if="row.story"
                        :href="`/w/${row.story.page}`"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {{ row.story.page }}
                      </a>
                      <span v-else class="text-disabled">未收录</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </template>
        </template>
      </NModal>

      <CharacterFaceBrowserModal
        v-model:show="showFaces"
        :faces="faceItems"
        :filename-base="detailResource?.id ?? '角色'"
        :title="`${detailResource?.id ?? '角色'} · 表情预览`"
      />
    </NLayout>
  </NConfigProvider>
</template>

<style scoped>
@import "@/styles/dark-mode.scss";

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
