<script setup lang="ts">
import { computed, ref, shallowRef, watch } from "vue";

import {
  AkButton,
  AkDialog,
  AkEmpty,
  AkMessage,
  AkSkeleton,
  AkSpinner,
  AkTag,
  useToast,
} from "@mooncellwiki/prts-design-vue";

import { wikiFileName } from "../../NpcPortrait/resolve";
import { composeCharacter, downloadUrl, saveBlob } from "../download";
import { useExplorer, type Resource } from "../store";
import {
  assetStorageUrl,
  loadUsages,
  wikiFileExists,
  type UsageResult,
} from "../usages";
import {
  CHARACTER_CATEGORIES,
  buildFaceGallery,
  cdnImageUrl,
  faceUsageCounts,
  resourcePreview,
  resourceTypeLabel,
  type CharacterPreview,
} from "../utils";

import ResourceImage from "./ResourceImage.vue";
import UsageTable from "./UsageTable.vue";

/**
 * 资源详情（对话框）：大图 + 基本信息与操作；角色另有「同一角色的立绘」与「表情」两排；
 * 下面是用到它的剧本。底栏沿着当前结果翻上一个 / 下一个（← / → 键同）。
 * 改版前点图进的是文件页：大图、原图、文件用途；这里都有，文件用途换成了按剧本反查（准确到每个剧本）。
 */
const store = useExplorer();
const {
  state,
  detail,
  status,
  error,
  links,
  linksError,
  webp,
  bases,
  matchedTotal,
} = store;
const toast = useToast();

const show = computed({
  get: () => detail.id !== null,
  set: (value: boolean) => {
    if (!value) store.close();
  },
});

const resource = computed<Resource | undefined>(() =>
  detail.id ? store.find(detail.id) : undefined,
);

/** 同一角色的全部立绘（含自己），多于一张才出那一排 */
const siblings = computed(() => {
  const base = resource.value?.base;
  return (base && bases.value.get(base)) || [];
});

const category = computed(
  () =>
    CHARACTER_CATEGORIES.find(
      (option) => option.value === resource.value?.category,
    )?.label,
);

// ── 使用的剧本 ──
const usage = shallowRef<UsageResult | null>(null);
const usageError = ref("");
let usageToken = 0;

async function fetchUsages(): Promise<void> {
  const current = resource.value;
  if (!current) return;
  const token = ++usageToken;
  usage.value = null;
  usageError.value = "";
  try {
    const result = await loadUsages(current.type, current.id);
    if (token === usageToken) usage.value = result;
  } catch (error) {
    if (token !== usageToken) return;
    console.warn("[StoryAssetExplorer]", error);
    usageError.value = error instanceof Error ? error.message : String(error);
  }
}

watch(
  () => resource.value && `${resource.value.type}:${resource.value.id}`,
  (key) => {
    if (key) fetchUsages();
  },
  { immediate: true },
);

/** 剧中名：各剧本里这个角色显示过的名字，按出现次数排 */
const displayNames = computed(() => {
  const counts = new Map<string, number>();
  for (const row of usage.value?.rows ?? [])
    for (const name of row.displayNames)
      counts.set(name, (counts.get(name) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name]) => name);
});

// ── 表情（叠图角色：资源名是 base$N 的形态） ──
const isBody = computed(
  () =>
    resource.value?.type === "character" && !resource.value.id.includes("#"),
);

const faceCounts = computed(() => faceUsageCounts(usage.value?.rows ?? []));

const gallery = computed(() => {
  const current = resource.value;
  if (!isBody.value || !current || !links.value) return null;
  const items = buildFaceGallery(
    current.id,
    [...faceCounts.value.keys()].map((name) => `#${name}`),
    links.value,
  );
  return items && items.length > 0 ? items : null;
});

/** 选中的表情：链接 / 搜索指定的，否则剧情里用到的第一个，再不然是第一个 */
const face = computed(() => {
  const items = gallery.value;
  if (!items) return null;
  return (
    items.find(
      (item) => item.expression.toLowerCase() === detail.face?.toLowerCase(),
    ) ??
    items.find((item) => item.used) ??
    items[0]
  );
});

function selectFace(name: string): void {
  detail.face = name;
}

const preview = computed<CharacterPreview | null | undefined>(() => {
  const current = resource.value;
  if (!current) return null;
  if (face.value)
    return {
      kind: "composite",
      baseUrl: face.value.baseUrl,
      faceUrl: face.value.faceUrl,
      faceRect: face.value.faceRect,
    };
  return resourcePreview(
    current.type,
    current.id,
    links.value,
    linksError.value,
  );
});

/** 剧本里引用这张图写的名字：叠图角色是 base#表情，其余就是资源名 */
const scriptName = computed(() => {
  const current = resource.value;
  if (!current) return "";
  if (face.value && current.base)
    return `${current.base}#${face.value.expression}`;
  return current.id;
});

// ── wiki 文件页（改版前每张图都链到它） ──
const wikiFile = computed(() => {
  const current = resource.value;
  if (!current) return null;
  if (current.type !== "character") return `Avg_${current.id}.png`;
  const node = current.base ? links.value?.get(current.base) : undefined;
  if (!node) return null;
  const name =
    face.value?.expression ?? current.id.slice(current.id.indexOf("#") + 1);
  const item = node.items.get(name);
  const path = item?.face ?? item?.image;
  return path ? wikiFileName(path.split("/")[0], name) : null;
});
const wikiFileFound = ref(false);
watch(
  wikiFile,
  async (title) => {
    wikiFileFound.value = false;
    if (!title) return;
    const found = await wikiFileExists(title);
    if (title === wikiFile.value) wikiFileFound.value = found;
  },
  { immediate: true },
);

// ── 操作 ──
async function copy(text: string, title: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(text, { title });
  } catch {
    toast.error(text, { title: "复制失败，请手动复制" });
  }
}

const downloading = ref<"image" | "face" | null>(null);

async function download(part: "image" | "face"): Promise<void> {
  const current = preview.value;
  if (!current || downloading.value) return;
  downloading.value = part;
  try {
    if (current.kind === "single") {
      await downloadUrl(current.url, `${scriptName.value}.png`);
    } else if (part === "face") {
      await downloadUrl(current.faceUrl, `${scriptName.value}_face.png`);
    } else {
      saveBlob(
        await composeCharacter(
          current.baseUrl,
          current.faceUrl,
          current.faceRect,
        ),
        `${scriptName.value}.png`,
      );
    }
  } catch (error) {
    console.warn("[StoryAssetExplorer] download", error);
    toast.error("图片没取到，稍后再试", { title: "下载失败" });
  } finally {
    downloading.value = null;
  }
}

// ── 上一个 / 下一个 ──
const position = computed(() => store.detailIndex.value);

function onKeydown(event: KeyboardEvent): void {
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
  const target = event.target as HTMLElement | null;
  if (target?.closest("input, textarea, select, [contenteditable]")) return;
  if (event.key === "ArrowLeft") store.move(-1);
  else if (event.key === "ArrowRight") store.move(1);
  else return;
  event.preventDefault();
}

/** 表情 / 立绘那两排的小图走 CDN 缩图 */
const faceThumb = (url: string) => cdnImageUrl(url, "resize,l_128", webp.value);
</script>

<template>
  <AkDialog
    v-model="show"
    size="lg"
    class="sae-detail"
    :label="resource?.id ?? detail.id ?? '资源详情'"
    @keydown="onKeydown"
  >
    <template #header>
      <span class="sae-detail__title">{{ resource?.id ?? detail.id }}</span>
    </template>

    <template v-if="!detail.id" />
    <AkSpinner
      v-else-if="!resource && (status === 'loading' || status === 'idle')"
      description="正在载入资源…"
    />
    <AkEmpty
      v-else-if="status === 'error'"
      icon="warn"
      title="资源读取失败"
      :description="error"
    >
      <template #extra>
        <AkButton variant="link" @click="store.reload()">重试</AkButton>
      </template>
    </AkEmpty>
    <AkEmpty
      v-else-if="!resource"
      icon="search"
      :title="`没有找到${resourceTypeLabel(state.type)} ${detail.id}`"
      description="可能是链接里的名字写错了，或者这个资源已经不再被剧情使用。"
    />
    <div v-else class="sae-detail__body">
      <div :class="['sae-hero', `sae-hero--${resource.type}`]">
        <div class="sae-hero__stage">
          <ResourceImage :preview="preview" eager :alt="scriptName" />
        </div>

        <div class="sae-hero__info">
          <div class="sae-hero__tags">
            <AkTag size="sm">{{ resourceTypeLabel(resource.type) }}</AkTag>
            <AkTag v-if="category" size="sm" variant="outline">
              {{ category }}
            </AkTag>
          </div>
          <dl class="sae-kv">
            <dt>剧本</dt>
            <dd>
              <b>{{ resource.scriptCount }}</b> 个剧本使用
            </dd>
            <template v-if="resource.type === 'character'">
              <dt>剧中名</dt>
              <dd>
                <template v-if="usage">
                  {{ displayNames.slice(0, 12).join("、") || "—" }}
                  <span v-if="displayNames.length > 12" class="sae-dim">
                    等 {{ displayNames.length }} 个
                  </span>
                </template>
                <AkSkeleton v-else text width="60%" />
              </dd>
            </template>
            <template v-if="scriptName !== resource.id">
              <dt>剧本写法</dt>
              <dd>
                <code>{{ scriptName }}</code>
              </dd>
            </template>
          </dl>

          <div class="sae-hero__actions">
            <AkButton
              size="sm"
              icon="quote"
              @click="copy(scriptName, '名称已复制')"
            >
              复制名称
            </AkButton>
            <AkButton
              size="sm"
              icon="link"
              @click="copy(store.shareLink(true), '链接已复制')"
            >
              复制链接
            </AkButton>
            <AkButton
              v-if="preview?.kind === 'single'"
              size="sm"
              icon="arrow-ne"
              :href="preview.url"
              target="_blank"
              rel="noopener"
            >
              原图
            </AkButton>
            <AkButton
              v-if="preview"
              size="sm"
              icon="download"
              :loading="downloading === 'image'"
              @click="download('image')"
            >
              {{ preview.kind === "composite" ? "下载合成图" : "下载" }}
            </AkButton>
            <AkButton
              v-if="preview?.kind === 'composite'"
              size="sm"
              icon="download"
              :loading="downloading === 'face'"
              @click="download('face')"
            >
              下载脸部
            </AkButton>
          </div>
          <div class="sae-hero__links">
            <a
              v-if="wikiFile && wikiFileFound"
              :href="`/w/File:${encodeURIComponent(wikiFile)}`"
              target="_blank"
              rel="noopener"
            >
              wiki 文件页
            </a>
            <a
              :href="assetStorageUrl(resource.type, resource.id)"
              target="_blank"
              rel="noopener"
            >
              在资源库中打开
            </a>
          </div>
          <section v-if="siblings.length > 1" class="sae-strip">
            <h3 class="sae-strip__title">
              同一角色的立绘<small>{{ siblings.length }}</small>
            </h3>
            <ul class="sae-strip__list" role="list">
              <li v-for="item in siblings" :key="item.id">
                <button
                  type="button"
                  :class="[
                    'sae-strip__item',
                    { 'is-active': item.id === resource.id },
                  ]"
                  :aria-current="item.id === resource.id || undefined"
                  :title="`${item.id}\n${item.scriptCount} 个剧本`"
                  @click="store.open(item.id)"
                >
                  <ResourceImage
                    :preview="
                      resourcePreview(item.type, item.id, links, linksError)
                    "
                    :thumb="160"
                    :webp="webp"
                  />
                  <span class="sae-strip__count">{{ item.scriptCount }}</span>
                </button>
              </li>
            </ul>
          </section>

          <section v-if="gallery" class="sae-strip">
            <h3 class="sae-strip__title">
              表情<small>{{ gallery.length }}</small>
              <span class="sae-dim">
                剧情里用到 {{ gallery.filter((item) => item.used).length }} 个
              </span>
            </h3>
            <ul class="sae-strip__list sae-strip__list--faces" role="list">
              <li v-for="item in gallery" :key="item.expression">
                <button
                  type="button"
                  :class="[
                    'sae-strip__item',
                    {
                      'is-active': item.expression === face?.expression,
                      'is-unused': !item.used,
                    },
                  ]"
                  :aria-pressed="item.expression === face?.expression"
                  :title="`${item.expression}\n${
                    faceCounts.get(item.expression) ?? 0
                  } 个剧本用到`"
                  @click="selectFace(item.expression)"
                >
                  <img
                    :src="faceThumb(item.faceUrl)"
                    alt=""
                    loading="lazy"
                    decoding="async"
                  />
                  <span class="sae-strip__name">{{ item.expression }}</span>
                </button>
              </li>
            </ul>
          </section>
        </div>
      </div>

      <section class="sae-usage-section">
        <h3 class="sae-strip__title">
          使用的剧本<small>{{ resource.scriptCount }}</small>
        </h3>
        <AkMessage v-if="usageError" variant="danger" title="剧本列表没取到">
          {{ usageError }}
          <AkButton variant="link" size="xs" @click="fetchUsages"
            >重试</AkButton
          >
        </AkMessage>
        <AkSkeleton v-else-if="!usage" text :repeat="5" />
        <template v-else>
          <AkMessage v-if="usage.truncated" variant="warning">
            {{ usage.truncated }}
          </AkMessage>
          <AkEmpty
            v-if="usage.rows.length === 0"
            :title="`没有剧本用到 ${resource.id}`"
          />
          <UsageTable
            v-else
            :rows="usage.rows"
            :character="resource.type === 'character'"
            :faces="Boolean(gallery)"
            :selected-face="face?.expression ?? null"
            @select-face="selectFace"
          />
        </template>
      </section>
    </div>

    <template #footer>
      <div class="sae-detail__nav">
        <AkButton
          size="sm"
          icon="chevron-left"
          :disabled="status === 'loading' || position <= 0"
          @click="store.move(-1)"
        >
          上一个
        </AkButton>
        <span v-if="position >= 0" class="sae-detail__pos">
          {{ position + 1 }} / {{ matchedTotal }}
        </span>
        <AkButton
          size="sm"
          icon="chevron-right"
          icon-placement="right"
          :disabled="
            status === 'loading' || position < 0 || position >= matchedTotal - 1
          "
          @click="store.move(1)"
        >
          下一个
        </AkButton>
      </div>
    </template>
  </AkDialog>
</template>

<style scoped lang="scss">
.sae-detail__title {
  font-family: var(--ak-font-mono);
  overflow-wrap: anywhere;
}

.sae-detail__body {
  display: flex;
  flex-direction: column;
  gap: var(--ak-space-5);
}

.sae-dim {
  font-size: var(--ak-fs-xs);
  font-weight: 400;
  color: var(--ak-fg-muted);
}

// ── 大图 + 信息 ──
// 方图（角色 / 道具）的大图限在 360 宽，右栏放信息、操作、立绘 / 表情两排；横图（背景 / 图像）大图宽一些。
// 正文窄于 640 时上下排。
.sae-hero {
  display: grid;
  grid-template-columns: minmax(0, 360px) minmax(0, 1fr);
  gap: var(--ak-space-4) var(--ak-space-5);
  align-items: start;

  &--background,
  &--image {
    grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
  }

  @container sae-detail (max-width: 640px) {
    &,
    &--background,
    &--image {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  &__stage {
    // 透明图垫棋盘格，看得出哪里是透明的
    background: repeating-conic-gradient(
        var(--ak-bg-surface-3) 0 25%,
        var(--ak-bg-surface) 0 50%
      )
      0 0 / 16px 16px;
    border: 1px solid var(--ak-border);
    aspect-ratio: 16 / 9;
  }

  &--character &__stage,
  &--item &__stage {
    aspect-ratio: 1;
    width: 100%;
    max-width: min(360px, 52vh);
    justify-self: center;
  }

  &__info {
    display: flex;
    flex-direction: column;
    gap: var(--ak-space-3);
    min-width: 0;
  }

  &__tags {
    display: flex;
    gap: 6px;
  }

  &__actions {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;

    :deep(.ak-icon) {
      width: 14px;
      height: 14px;
    }
  }

  &__links {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 16px;
    font-size: var(--ak-fs-sm);

    a {
      color: var(--ak-link);
      text-decoration: none;

      &:hover {
        color: var(--ak-link-hover);
        text-decoration: underline;
      }
    }
  }
}

.sae-strip {
  margin-top: var(--ak-space-2);
}

.sae-kv {
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr);
  gap: 6px 12px;
  margin: 0;
  font-size: var(--ak-fs-sm);

  dt {
    color: var(--ak-fg-muted);
    font-weight: 600;
  }

  dd {
    margin: 0;
    min-width: 0;
    overflow-wrap: anywhere;
  }

  b {
    font-variant-numeric: tabular-nums;
  }

  code {
    font: 12px / 1.5 var(--ak-font-mono);
    padding: 1px 4px;
    background: var(--ak-bg-surface-2);
    border: 1px solid var(--ak-border-subtle);
  }
}

// ── 同一角色的立绘 / 表情：横排小图 ──
.sae-strip__title {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin: 0 0 var(--ak-space-2);
  padding-left: 8px;
  border-left: var(--ak-bar-w, 3px) solid var(--ak-accent);
  font-size: var(--ak-fs-body);
  font-weight: 700;
  line-height: 1.3;

  small {
    font-weight: 500;
    font-size: var(--ak-fs-sm);
    color: var(--ak-fg-muted);
    font-variant-numeric: tabular-nums;
  }
}

.sae-strip__list {
  display: grid;
  grid-template-columns: repeat(auto-fill, 64px);
  gap: 4px;
  margin: 0;
  padding: 0;
  list-style: none;

  > li {
    margin: 0;
  }

  &--faces {
    grid-template-columns: repeat(auto-fill, 60px);
    max-height: 252px;
    overflow-y: auto;
  }
}

.sae-strip__item {
  all: unset;
  box-sizing: border-box;
  position: relative;
  display: flex;
  flex-direction: column;
  width: 100%;
  aspect-ratio: 1;
  background: var(--ak-bg-surface-2);
  border: 1px solid var(--ak-border);
  cursor: pointer;

  .sae-strip__list--faces & {
    aspect-ratio: auto;
  }

  > img {
    display: block;
    width: 100%;
    aspect-ratio: 1;
    object-fit: contain;
  }

  &:hover {
    border-color: var(--ak-fg-muted);
  }

  &.is-active {
    border-color: var(--ak-accent);
    box-shadow: inset 0 0 0 1px var(--ak-accent);
  }

  &.is-active::before {
    content: "";
    position: absolute;
    top: 0;
    left: 0;
    z-index: 1;
    border-style: solid;
    border-width: 8px 8px 0 0;
    border-color: var(--ak-accent) transparent transparent;
  }

  // 剧情里没用到的表情压淡
  &.is-unused > img {
    opacity: 0.45;
  }

  &:focus-visible {
    outline: 2px solid var(--ak-focus);
    outline-offset: 1px;
  }
}

.sae-strip__count {
  position: absolute;
  right: 0;
  bottom: 0;
  padding: 0 4px;
  font: 600 11px / 16px var(--ak-font-body);
  font-variant-numeric: tabular-nums;
  background: var(--ak-bg-inverse);
  color: var(--ak-fg-inverse);
  opacity: 0.85;
}

.sae-strip__name {
  padding: 1px 2px;
  font: 11px / 1.3 var(--ak-font-mono);
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  border-top: 1px solid var(--ak-border-subtle);
  color: var(--ak-fg-secondary);
}

// ── 底栏：上一个 · 位置 · 下一个，占满一行 ──
.sae-detail__nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ak-space-3);
  width: 100%;

  :deep(.ak-icon) {
    width: 14px;
    height: 14px;
  }
}

.sae-detail__pos {
  font-size: var(--ak-fs-sm);
  color: var(--ak-fg-muted);
  font-variant-numeric: tabular-nums;
}
</style>

<style lang="scss">
// 对话框本身（AkDialog 的根是 <dialog>，scoped 样式够不着它的子元素布局）：正文高一些、作容器给上面的 @container 用
dialog.sae-detail {
  // 设计系统的 --lg 只写了 max-width: 900px，手机上会比视口宽出两道边框
  max-width: min(900px, calc(100vw - 16px));

  .ak-dialog__body {
    max-height: min(78vh, 900px);
    container: sae-detail / inline-size;
  }
}
</style>
