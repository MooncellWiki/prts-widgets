<script setup lang="ts">
import { ref } from "vue";

import {
  AkChip,
  AkInput,
  AkPopover,
  AkTabPane,
  AkTabs,
  AkTag,
} from "@mooncellwiki/prts-design-vue";

import {
  EQUIP_ADVANCED_TABS,
  filterModeDef,
  isFilterModeActive,
  TYPE_VALUE_OPTIONS,
  YES_NO_OPTIONS,
  type ActiveEquipFilterMode,
  type EquipAdvancedTab,
  type EquipFilterSelection,
  type FilterOption,
  type FilterValueKind,
} from "../filters";

import FilterRow from "./FilterRow.vue";

/**
 * 高级筛选里的模组筛选（同 CharList 的高级筛选）：
 * 每一类条件一个页签，页签左边是方式、右边是选项；不同页签之间是「且」，
 * 同一页签里的多个值按各自规则取「或」。
 */
const props = withDefaults(
  defineProps<{
    timeOptions: FilterOption[];
    disabled?: boolean;
    narrow?: boolean;
  }>(),
  { disabled: false, narrow: false },
);

const selection = defineModel<EquipFilterSelection>("selection", {
  required: true,
});
const currentTab = ref(EQUIP_ADVANCED_TABS[0].id);
const timeOpen = ref(false);

const countOf = (tab: EquipAdvancedTab) =>
  tab.modes.reduce((sum, mode) => sum + selection.value[mode].length, 0);

const kindOf = (mode: ActiveEquipFilterMode): FilterValueKind =>
  filterModeDef(mode).kind;

const isModeActive = (mode: ActiveEquipFilterMode) =>
  isFilterModeActive(selection.value[mode]);

const setModeValues = (mode: ActiveEquipFilterMode, values: string[]) => {
  selection.value = { ...selection.value, [mode]: values };
};

const toggleSingle = (mode: ActiveEquipFilterMode, value: string) => {
  if (props.disabled) return;
  const values = selection.value[mode];
  setModeValues(mode, values.includes(value) ? [] : [value]);
};

const toggleMulti = (mode: ActiveEquipFilterMode, value: string) => {
  if (props.disabled) return;
  const values = selection.value[mode];
  setModeValues(
    mode,
    values.includes(value)
      ? values.filter((item) => item !== value)
      : [...values, value],
  );
};

const setText = (mode: ActiveEquipFilterMode, value: string | undefined) => {
  setModeValues(mode, value ? [value] : []);
};

const timeLabel = (value: string) =>
  props.timeOptions.find((option) => option.value === value)?.label ?? value;

const clearMode = (mode: ActiveEquipFilterMode) => setModeValues(mode, []);
</script>

<template>
  <div class="ep-adv">
    <AkTabs
      :model-value="currentTab"
      class="ep-adv__tabs"
      :placement="narrow ? 'top' : 'left'"
      label="模组筛选分类"
      @update:model-value="currentTab = String($event)"
    >
      <AkTabPane
        v-for="tab in EQUIP_ADVANCED_TABS"
        :key="tab.id"
        :name="tab.id"
        :class="['ep-adv__panel', `ep-adv__panel--${tab.id}`]"
        display-directive="show:lazy"
      >
        <template #tab>
          {{ tab.title }}
          <small v-if="countOf(tab)">{{ countOf(tab) }}</small>
        </template>

        <div class="ep-rows">
          <FilterRow
            v-for="mode in tab.modes"
            :key="mode"
            :title="filterModeDef(mode).label"
            :active="isModeActive(mode)"
            clearable
            @clear="clearMode(mode)"
          >
            <template
              v-if="kindOf(mode) === 'yesno' || kindOf(mode) === 'stat'"
            >
              <AkChip
                v-for="option in YES_NO_OPTIONS"
                :key="option.value"
                :model-value="selection[mode].includes(option.value)"
                :class="{ 'is-disabled': disabled }"
                :aria-disabled="disabled || undefined"
                @update:model-value="toggleSingle(mode, option.value)"
              >
                {{ option.label }}
              </AkChip>
            </template>

            <template v-else-if="kindOf(mode) === 'type'">
              <AkChip
                v-for="option in TYPE_VALUE_OPTIONS"
                :key="option.value"
                :model-value="selection[mode].includes(option.value)"
                :class="{ 'is-disabled': disabled }"
                :aria-disabled="disabled || undefined"
                @update:model-value="toggleMulti(mode, option.value)"
              >
                {{ option.label }}
              </AkChip>
            </template>

            <template v-else-if="kindOf(mode) === 'addtime'">
              <div v-if="narrow" class="ep-time ep-time--inline">
                <button
                  type="button"
                  class="ep-time__trigger"
                  :disabled="disabled"
                  :aria-expanded="timeOpen"
                  @click="timeOpen = !timeOpen"
                >
                  <span
                    v-if="selection[mode].length === 0"
                    class="ep-time__placeholder"
                  >
                    全部时间
                  </span>
                  <span v-else class="ep-time__values">
                    <AkTag
                      v-for="value in selection[mode]"
                      :key="value"
                      size="sm"
                    >
                      {{ timeLabel(value) }}
                    </AkTag>
                  </span>
                </button>

                <div
                  v-if="timeOpen"
                  class="ep-time__menu ep-time__menu--inline"
                >
                  <AkChip
                    v-for="option in timeOptions"
                    :key="option.value"
                    :model-value="selection[mode].includes(option.value)"
                    :class="{ 'is-disabled': disabled }"
                    :aria-disabled="disabled || undefined"
                    @update:model-value="toggleMulti(mode, option.value)"
                  >
                    {{ option.label }}
                  </AkChip>
                </div>
              </div>

              <AkPopover
                v-else
                placement="bottom-start"
                :disabled="disabled"
                class="ep-time"
              >
                <template #trigger>
                  <button
                    type="button"
                    class="ep-time__trigger"
                    :disabled="disabled"
                  >
                    <span
                      v-if="selection[mode].length === 0"
                      class="ep-time__placeholder"
                    >
                      全部时间
                    </span>
                    <span v-else class="ep-time__values">
                      <AkTag
                        v-for="value in selection[mode]"
                        :key="value"
                        size="sm"
                      >
                        {{ timeLabel(value) }}
                      </AkTag>
                    </span>
                  </button>
                </template>

                <div class="ep-time__menu">
                  <AkChip
                    v-for="option in timeOptions"
                    :key="option.value"
                    :model-value="selection[mode].includes(option.value)"
                    :class="{ 'is-disabled': disabled }"
                    :aria-disabled="disabled || undefined"
                    @update:model-value="toggleMulti(mode, option.value)"
                  >
                    {{ option.label }}
                  </AkChip>
                </div>
              </AkPopover>
            </template>

            <AkInput
              v-else-if="kindOf(mode) === 'text'"
              class="ep-adv__input"
              :model-value="selection[mode][0] ?? ''"
              :disabled="disabled"
              label="任务关卡"
              placeholder="输入关卡名"
              @update:model-value="setText(mode, $event)"
            />
          </FilterRow>
        </div>
      </AkTabPane>
    </AkTabs>
  </div>
</template>

<style scoped lang="scss">
.ep-adv {
  min-width: 0;
}

.ep-time {
  display: inline-block;
  max-width: 100%;
}

.ep-time--inline {
  display: block;
  width: 100%;
}

.ep-time__menu--inline {
  box-sizing: border-box;
  width: 100%;
  max-width: 360px;
  max-height: none;
  margin-top: 4px;
  padding: 8px;
  background: var(--ak-bg-surface);
  border: 1px solid var(--ak-border);
}

.ep-time__trigger {
  position: relative;
  box-sizing: border-box;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  width: 100%;
  max-width: 360px;
  min-height: 34px;
  padding: 4px 30px 4px 8px;
  color: var(--ak-fg);
  font: inherit;
  line-height: 1.2;
  text-align: left;
  background: var(--ak-bg-surface);
  border: 1px solid var(--ak-border-strong);
  border-radius: var(--ak-radius);
  cursor: pointer;

  &::after {
    content: "";
    position: absolute;
    top: 50%;
    right: 10px;
    width: 0;
    height: 0;
    border-top: 5px solid var(--ak-fg-muted);
    border-right: 4px solid transparent;
    border-left: 4px solid transparent;
    transform: translateY(-50%);
  }

  &:hover {
    border-color: var(--ak-fg-muted);
  }

  &:focus-visible {
    outline: 2px solid var(--ak-focus);
    outline-offset: 2px;
  }

  &:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }
}

.ep-time__placeholder {
  color: var(--ak-fg-muted);
}

.ep-time__values {
  display: flex;
  flex: 1 1 100%;
  flex-wrap: wrap;
  gap: 4px;
  align-items: center;
  min-width: 0;

  .ak-tag {
    margin: 0;
  }
}

.ep-time__menu {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  min-width: 240px;
  max-height: 220px;
  overflow: auto;
}

.ep--narrow .ep-time__trigger {
  max-width: none;
}

.ep-adv__tabs {
  gap: 0;

  &.ak-tabset--left {
    align-items: stretch;
  }

  > :deep(.ak-tabs) {
    .ak-tab:focus-visible {
      outline: 2px solid var(--ak-focus);
      outline-offset: -2px;
    }

    .ak-tab small {
      min-width: 16px;
      padding: 2px 4px;
      font-size: 10px;
      text-align: center;
      letter-spacing: 0;
      color: var(--ak-accent-fg);
      background: var(--ak-accent);
    }
  }

  > :deep(.ak-tabs--vertical) {
    border-left: 0;
    border-right: 1px solid var(--ak-border);
    padding: 6px 0;
    gap: 0;
    min-width: 132px;
    background: var(--ak-bg-surface-2);

    .ak-tab {
      margin: 0;
      padding: 8px var(--ak-space-3) 8px
        calc(var(--ak-space-3) - 3px + var(--ak-bar-w) - 1px);
      align-items: center;
      font-family: inherit;
    }
  }

  .ep--narrow & > :deep(.ak-tabs) {
    padding: 0 4px;

    .ak-tab {
      padding: 8px 10px;
    }
  }

  > :deep(.ep-adv__panel) {
    min-width: 0;
    min-height: 168px;
    padding-top: 0;

    &:focus-visible {
      outline-offset: -2px;
    }

    .ep--narrow & {
      min-height: 0;
    }
  }
}

.ep-rows {
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr);

  .ep--narrow & {
    grid-template-columns: minmax(0, 1fr);
  }
}

.ep-adv__input {
  display: block;
  max-width: 280px;

  .ep--narrow & {
    max-width: none;
  }
}

.ak-chip.is-disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
</style>
