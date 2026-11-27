<script setup lang="ts">
import { computed, useId } from "vue";

import {
  AkButton,
  AkButtonGroup,
  AkSearch,
  AkSelect,
  type IconName,
  type SelectValue,
} from "@mooncellwiki/prts-design-vue";

import {
  EQUIP_SORT_OPTIONS,
  firstSortDir,
  GroupBy,
  View,
  type EquipGroupBy,
  type EquipSort,
  type EquipSortKey,
  type EquipView,
} from "./filters";
import { useEquipListStore } from "./store";

/**
 * 工具条：排序（排序项 + 升降，同干员一览）+ 显示方式（表格 / 头像）。
 * 表格时右侧放简略内容（数值 / 模组任务）；头像时右侧放分组方式。
 */
const props = defineProps<{
  sort: EquipSort;
  view: EquipView;
  group: EquipGroupBy;
}>();

const emit = defineEmits<{
  "update:sort": [sort: EquipSort];
  "update:view": [view: EquipView];
  "update:group": [group: EquipGroupBy];
}>();

const store = useEquipListStore();
const q = defineModel<string>("q", { required: true });
const sortId = useId();

const VIEWS: { view: EquipView; label: string; icon: IconName }[] = [
  { view: View.TABLE, label: "表格", icon: "table" },
  { view: View.AVATAR, label: "头像", icon: "grid" },
];

const GROUPS: { group: EquipGroupBy; label: string }[] = [
  { group: GroupBy.SUB, label: "按分支" },
  { group: GroupBy.TIME, label: "按时间" },
  { group: GroupBy.OPT, label: "按关卡" },
];

const dirLabel = computed(() => (props.sort.dir > 0 ? "升序" : "降序"));

const setSortKey = (value: SelectValue | null | undefined) => {
  if (typeof value !== "string") return;
  const key = value as EquipSortKey;
  emit("update:sort", { key, dir: firstSortDir(key) });
};

const flipSort = () => {
  emit("update:sort", {
    key: props.sort.key,
    dir: props.sort.dir > 0 ? -1 : 1,
  });
};
</script>

<template>
  <div :class="['ep-toolbar', { 'ep-toolbar--avatar': view === View.AVATAR }]">
    <AkSearch
      v-model="q"
      class="ep-search"
      placeholder="搜索干员 / 模组名称"
      label="搜索干员名称或模组名称"
      autocomplete="off"
    />

    <div v-if="view === View.TABLE" class="ep-field ep-sort">
      <label :for="sortId">排序</label>
      <AkSelect
        :id="sortId"
        :model-value="sort.key"
        :options="EQUIP_SORT_OPTIONS"
        @update:model-value="setSortKey"
      />
      <AkButton :label="`排序方向：${dirLabel}，点击切换`" @click="flipSort">
        {{ dirLabel }} {{ sort.dir > 0 ? "↑" : "↓" }}
      </AkButton>
    </div>

    <AkButtonGroup class="ep-view" label="显示方式">
      <AkButton
        v-for="item in VIEWS"
        :key="item.view"
        :icon="item.icon"
        :aria-pressed="view === item.view"
        @click="emit('update:view', item.view)"
      >
        {{ item.label }}
      </AkButton>
    </AkButtonGroup>

    <div class="ep-mode-opts">
      <AkButtonGroup
        v-if="view === View.TABLE"
        class="ep-simple"
        label="简略内容"
      >
        <AkButton
          :aria-pressed="store.simple === 'stats'"
          @click="store.simple = 'stats'"
        >
          数值
        </AkButton>
        <AkButton
          :aria-pressed="store.simple === 'mission'"
          @click="store.simple = 'mission'"
        >
          模组任务
        </AkButton>
      </AkButtonGroup>

      <AkButtonGroup v-else class="ep-group" label="头像分组">
        <AkButton
          v-for="item in GROUPS"
          :key="item.group"
          :aria-pressed="group === item.group"
          @click="emit('update:group', item.group)"
        >
          {{ item.label }}
        </AkButton>
      </AkButtonGroup>
    </div>
  </div>
</template>

<style scoped lang="scss">
.ep-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 16px;
  margin: 0 0 var(--ak-space-3);
  padding: 10px var(--ak-space-3);
  background: var(--ak-bg-surface-2);
  border: 1px solid var(--ak-border);
}

.ep-search {
  flex: 1 1 240px;
  min-width: 0;
}

.ep-toolbar--avatar .ep-sort {
  display: none;
}

.ep-field {
  display: inline-flex;
  align-items: center;
  font-size: var(--ak-fs-xs);
  font-weight: 600;
  color: var(--ak-fg-muted);
  white-space: nowrap;

  .ak-select {
    width: auto;
    min-height: 36px;
    color: var(--ak-fg);
    font-weight: 400;
  }
}

.ep-sort {
  > label {
    margin-right: 8px;
  }

  > .ak-btn {
    margin-left: -1px;
    min-width: 76px;
    padding: 0 var(--ak-space-3);
    font-weight: 500;
  }
}

.ep-mode-opts {
  display: flex;
}

.ep-view,
.ep-simple,
.ep-group {
  .ak-btn {
    gap: 6px;

    &[aria-pressed="true"] {
      --_bg: var(--ak-accent);
      --_fg: var(--ak-accent-fg);
      --_bd: var(--ak-accent);

      z-index: 1;
    }
  }

  :deep(.ak-icon) {
    width: 14px;
    height: 14px;
  }
}
</style>
