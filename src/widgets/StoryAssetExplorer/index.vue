<script setup lang="ts">
import { onMounted, ref } from "vue";

import { NButton, NConfigProvider, NInput, NSelect, NSkeleton } from "naive-ui";

import { TORAPPU_ENDPOINT } from "@/utils/consts";
import { useTheme } from "@/utils/theme";

import {
  type CargoStoryRow,
  type StoryResourceType,
  type StoryUsageItem,
  type StoryUsageResponse,
  CARGO_IN_CHUNK,
  RESOURCE_TYPE_OPTIONS,
  cargoTextPathIn,
  chunk,
  normalizeCharacterId,
} from "./utils";

enum Status {
  idle,
  loading,
  fail,
  succ,
}

interface ResultRow extends StoryUsageItem {
  story?: CargoStoryRow;
}

const props = defineProps<{
  type?: string;
  id?: string;
}>();

const { theme, themeOverrides, isDark } = useTheme();

const resourceType = ref<StoryResourceType>(
  (RESOURCE_TYPE_OPTIONS.find((option) => option.value === props.type)?.value ??
    "background") as StoryResourceType,
);
const resourceId = ref(props.id ?? "");
const status = ref(Status.idle);
const errorMessage = ref("");
const rows = ref<ResultRow[]>([]);
const matchedCount = ref(0);
const queriedId = ref("");

async function fetchUsageItems(
  type: StoryResourceType,
  id: string,
): Promise<StoryUsageItem[]> {
  const items: StoryUsageItem[] = [];
  let cursor: string | null | undefined;
  // 上限保护：200/页 * 50 页
  for (let page = 0; page < 50; page++) {
    const params = new URLSearchParams({ type, id, limit: "200" });
    if (cursor) params.set("cursor", cursor);
    const resp = await fetch(
      `${TORAPPU_ENDPOINT}/api/v1/story-resource-usages?${params}`,
    );
    if (!resp.ok) {
      throw new Error(`story-resource-usages ${resp.status}`);
    }
    const data = (await resp.json()) as StoryUsageResponse;
    items.push(...data.items);
    cursor = data.nextCursor;
    if (!cursor) break;
  }
  return items;
}

async function fetchCargoStories(
  paths: string[],
): Promise<Map<string, CargoStoryRow>> {
  const map = new Map<string, CargoStoryRow>();
  for (const group of chunk(paths, CARGO_IN_CHUNK)) {
    const params = new URLSearchParams({
      action: "cargoquery",
      format: "json",
      tables: "story",
      fields: "_pageName=page,textPath,storyType,storyGroup",
      where: cargoTextPathIn(group),
      limit: String(CARGO_IN_CHUNK),
    });
    const resp = await fetch(`/api.php?${params}`);
    if (!resp.ok) {
      throw new Error(`cargoquery ${resp.status}`);
    }
    const json = (await resp.json()) as {
      cargoquery?: { title: CargoStoryRow }[];
    };
    for (const { title } of json.cargoquery ?? []) {
      if (!map.has(title.textPath)) {
        map.set(title.textPath, title);
      }
    }
  }
  return map;
}

async function query() {
  const raw = resourceId.value.trim();
  if (raw === "") return;
  const type = resourceType.value;
  const id = type === "character" ? normalizeCharacterId(raw) : raw;
  status.value = Status.loading;
  errorMessage.value = "";
  try {
    const items = await fetchUsageItems(type, id);
    const storyMap = await fetchCargoStories(
      items.map((item) => item.scriptPath),
    );
    rows.value = items.map((item) => ({
      ...item,
      story: storyMap.get(item.scriptPath),
    }));
    matchedCount.value = rows.value.filter((row) => row.story).length;
    queriedId.value = id;
    status.value = Status.succ;
  } catch (error) {
    console.warn(error);
    errorMessage.value = error instanceof Error ? error.message : String(error);
    status.value = Status.fail;
  }
}

onMounted(() => {
  if (props.id) query();
});
</script>

<template>
  <NConfigProvider
    preflight-style-disabled
    :breakpoints="{ s: 640, m: 768, lg: 1024, xl: 1280, xxl: 1536 }"
    :theme="theme"
    :theme-overrides="themeOverrides"
  >
    <div :class="['story-asset-explorer-widget', isDark && 'prts-widget-dark']">
      <form
        class="mb-2 flex flex-wrap items-center gap-2"
        @submit.prevent="query"
      >
        <NSelect
          v-model:value="resourceType"
          :options="RESOURCE_TYPE_OPTIONS"
          class="w-28 shrink-0"
        />
        <NInput
          v-model:value="resourceId"
          class="max-w-full w-80"
          placeholder="资源 ID，如 bg_indoor_2 / avg_npc_009（角色可省略 #表情$差分）"
          clearable
          @keyup.enter="query"
        />
        <NButton
          type="primary"
          :loading="status === Status.loading"
          @click="query"
        >
          查询
        </NButton>
      </form>

      <NButton v-if="status === Status.fail" @click="query">
        加载失败（{{ errorMessage }}） 点击重试
      </NButton>
      <NSkeleton v-else-if="status === Status.loading" :repeat="2" />
      <template v-else-if="status === Status.succ">
        <div v-if="rows.length > 0" class="mb-2 text-sm">
          共 {{ rows.length }} 条结果，{{ matchedCount }} 条已关联剧情页面（{{
            queriedId
          }}）
        </div>
        <div v-else class="mb-2 text-disabled">
          没有剧情文本使用 {{ queriedId }}
        </div>
        <div v-if="rows.length > 0" class="overflow-x-auto">
          <table class="w-full border-collapse text-left">
            <thead>
              <tr>
                <th class="border border-divider px-2 py-1">剧情文本</th>
                <th
                  v-if="resourceType === 'character'"
                  class="border border-divider px-2 py-1"
                >
                  显示名
                </th>
                <th class="border border-divider px-2 py-1">分类</th>
                <th class="border border-divider px-2 py-1">所属</th>
                <th class="border border-divider px-2 py-1">剧情页面</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in rows" :key="row.scriptPath">
                <td class="break-all border border-divider px-2 py-1">
                  <code>{{ row.scriptPath }}</code>
                </td>
                <td
                  v-if="resourceType === 'character'"
                  class="border border-divider px-2 py-1"
                >
                  {{ row.displayNames.join("、") }}
                </td>
                <td class="border border-divider px-2 py-1">
                  {{ row.story?.storyType ?? "-" }}
                </td>
                <td class="border border-divider px-2 py-1">
                  {{ row.story?.storyGroup ?? "-" }}
                </td>
                <td class="border border-divider px-2 py-1">
                  <a
                    v-if="row.story"
                    :href="`/w/${row.story.page}`"
                    target="_blank"
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
    </div>
  </NConfigProvider>
</template>

<style scoped>
@import "@/styles/dark-mode.scss";
</style>
