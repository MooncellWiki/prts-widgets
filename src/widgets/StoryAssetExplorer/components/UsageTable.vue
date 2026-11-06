<script setup lang="ts">
import { computed, ref, watch } from "vue";

import {
  AkButton,
  AkChip,
  AkEmpty,
  AkSearch,
} from "@mooncellwiki/prts-design-vue";

import { scriptSourceUrl } from "../usages";
import { faceNameOf, groupUsages, type UsageRow } from "../utils";

/**
 * 使用这个资源的剧本：按剧情页面所属的活动 / 章节分组（cargo 的 storyGroup），没收录到剧情页面的放最后。
 * 一行 = 剧情页面（链到 wiki）· 分类 · 角色的剧中名 · 叠图角色用到的表情（点了在上面预览那个表情）· 剧本原文（torappu）。
 * 多于 8 行时出筛选框；选中了表情时可以只看用到它的剧本。
 */
const props = defineProps<{
  rows: readonly UsageRow[];
  /** 角色：多一列剧中名 */
  character: boolean;
  /** 叠图角色：多一列表情 */
  faces: boolean;
  selectedFace: string | null;
}>();
defineEmits<{ selectFace: [name: string] }>();

const filter = ref("");
const onlyFace = ref(false);

watch(
  () => props.rows,
  () => {
    filter.value = "";
    onlyFace.value = false;
  },
);
watch(
  () => props.selectedFace,
  (face) => {
    if (!face) onlyFace.value = false;
  },
);

const filtered = computed(() => {
  const text = filter.value.trim().toLowerCase();
  const face = onlyFace.value ? props.selectedFace : null;
  return props.rows.filter((row) => {
    if (face && !(row.faces ?? []).some((id) => faceNameOf(id) === face))
      return false;
    if (!text) return true;
    return [
      row.scriptPath,
      row.story?.page,
      row.story?.storyGroup,
      row.story?.storyType,
      ...row.displayNames,
    ].some((value) => value?.toLowerCase().includes(text));
  });
});

const groups = computed(() => groupUsages(filtered.value));
const linked = computed(() => props.rows.filter((row) => row.story).length);
const columns = computed(
  () => 3 + (props.character ? 1 : 0) + (props.faces ? 1 : 0),
);

function pageHref(page: string): string {
  return `/w/${encodeURIComponent(page.replaceAll(" ", "_")).replaceAll("%2F", "/")}`;
}

/** 剧本路径拆成目录（淡）+ 文件名 */
function splitPath(path: string): [dir: string, name: string] {
  const slash = path.lastIndexOf("/");
  return [path.slice(0, slash + 1), path.slice(slash + 1)];
}
</script>

<template>
  <div class="sae-usage">
    <div class="sae-usage__head">
      <span class="sae-usage__count">
        {{ linked }} / {{ rows.length }} 个剧本已关联剧情页面
      </span>
      <AkChip
        v-if="faces && selectedFace"
        v-model="onlyFace"
        class="sae-usage__face"
      >
        只看用到表情 {{ selectedFace }} 的
      </AkChip>
      <AkSearch
        v-if="rows.length > 8"
        v-model="filter"
        size="sm"
        class="sae-usage__filter"
        placeholder="筛选剧情 / 活动 / 剧中名"
        label="筛选剧本"
      />
    </div>

    <AkEmpty
      v-if="groups.length === 0"
      icon="search"
      title="没有符合筛选的剧本"
    >
      <AkButton
        variant="link"
        @click="
          filter = '';
          onlyFace = false;
        "
      >
        清除筛选
      </AkButton>
    </AkEmpty>
    <div v-else class="sae-usage__scroll">
      <table class="ak-table ak-table--compact sae-usage__table">
        <thead>
          <tr>
            <th scope="col">剧情</th>
            <th scope="col">分类</th>
            <th v-if="character" scope="col">剧中名</th>
            <th v-if="faces" scope="col">表情</th>
            <th scope="col"><span class="ak-sr-only">原文</span></th>
          </tr>
        </thead>
        <tbody
          v-for="group in groups"
          :key="group.key"
          class="sae-usage__group"
        >
          <tr>
            <th :colspan="columns" scope="rowgroup">
              {{ group.key || "未收录到剧情页面" }}
              <small>{{ group.rows.length }}</small>
            </th>
          </tr>
          <tr v-for="row in group.rows" :key="row.scriptPath">
            <td class="sae-usage__page">
              <a
                v-if="row.story"
                :href="pageHref(row.story.page)"
                :title="row.scriptPath"
                target="_blank"
                rel="noopener"
              >
                {{ row.story.page }}
              </a>
              <span v-else class="sae-usage__path" :title="row.scriptPath">
                <span>{{ splitPath(row.scriptPath)[0] }}</span
                >{{ splitPath(row.scriptPath)[1] }}
              </span>
            </td>
            <td class="sae-usage__type">{{ row.story?.storyType ?? "—" }}</td>
            <td v-if="character" class="sae-usage__names">
              {{ row.displayNames.join("、") || "—" }}
            </td>
            <td v-if="faces" class="sae-usage__faces">
              <button
                v-for="id in row.faces ?? []"
                :key="id"
                type="button"
                :class="[
                  'sae-face-tag',
                  { 'is-active': faceNameOf(id) === selectedFace },
                ]"
                :aria-pressed="faceNameOf(id) === selectedFace"
                :title="`预览表情 ${faceNameOf(id)}`"
                @click="$emit('selectFace', faceNameOf(id))"
              >
                {{ faceNameOf(id) }}
              </button>
            </td>
            <td class="sae-usage__src">
              <AkButton
                :href="scriptSourceUrl(row.scriptPath)"
                target="_blank"
                rel="noopener"
                variant="ghost"
                size="xs"
                icon="source"
                label="在资源库查看剧本原文"
              />
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped lang="scss">
.sae-usage__head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
  margin-bottom: var(--ak-space-2);
}

.sae-usage__count {
  font-size: var(--ak-fs-sm);
  color: var(--ak-fg-muted);
}

.sae-usage__filter {
  flex: 0 1 260px;
  margin-left: auto;
}

.sae-usage__scroll {
  overflow-x: auto;
}

.sae-usage__table {
  min-width: 480px;

  td {
    vertical-align: top;
  }
}

// 分组行：同 akas 的剧本表（活动名一行，浅底、上边一道深线）
.sae-usage__group > tr:first-child > th {
  padding: 6px 8px;
  background: var(--ak-bg-surface-2);
  border-top: 1px solid var(--ak-border-strong);
  font-weight: 700;
  text-align: left;

  small {
    margin-left: 6px;
    font-weight: 500;
    color: var(--ak-fg-muted);
    font-variant-numeric: tabular-nums;
  }
}

.sae-usage__page a {
  color: var(--ak-link);
  text-decoration: none;

  &:hover {
    color: var(--ak-link-hover);
    text-decoration: underline;
  }
}

.sae-usage__path {
  font: 12px / 1.5 var(--ak-font-mono);
  overflow-wrap: anywhere;

  > span {
    color: var(--ak-fg-muted);
  }
}

.sae-usage__type,
.sae-usage__names {
  color: var(--ak-fg-secondary);
}

.sae-usage__type {
  white-space: nowrap;
}

.sae-usage__faces {
  max-width: 260px;
}

// 表情：小号方块按钮，选中 = 主色实底（同芯片）
.sae-face-tag {
  all: unset;
  display: inline-block;
  margin: 1px 4px 1px 0;
  padding: 0 5px;
  font: 12px / 18px var(--ak-font-mono);
  border: 1px solid var(--ak-border);
  color: var(--ak-fg-secondary);
  cursor: pointer;

  &:hover {
    border-color: var(--ak-fg-muted);
    color: var(--ak-fg);
  }

  &.is-active {
    background: var(--ak-accent);
    border-color: var(--ak-accent);
    color: var(--ak-accent-fg);
  }

  &:focus-visible {
    outline: 2px solid var(--ak-focus);
    outline-offset: 1px;
  }
}

.sae-usage__src {
  width: 1px;
  text-align: right;
}
</style>
