import { reactive, ref } from "vue";

import { defineStore } from "pinia";

import type { CharEquips } from "./types";

/**
 * 模组一览里几个组件共用的状态：展开着的模组、表格简略模式显示哪一块、还有几个模组卡片在处理。
 * 列表数据本身走 Pinia Colada（equipData.ts 的 equipListQuery）。
 */
export const useEquipListStore = defineStore("equipList", () => {
  /** 展开着的模组（按模组名） */
  const shown = reactive(new Set<string>());
  /** 表格简略模式：数值 / 模组任务 */
  const simple = ref<"stats" | "mission">("stats");
  /** 还在补攻击范围等内容的模组卡片数：处理完之前筛选按钮禁用 */
  const processing = ref(0);

  function isShown(char: CharEquips): boolean {
    return char.equips.some((equip) => !!equip.name && shown.has(equip.name));
  }

  function expand(chars: readonly CharEquips[]): void {
    for (const char of chars)
      for (const equip of char.equips) if (equip.name) shown.add(equip.name);
  }

  function collapse(chars: readonly CharEquips[]): void {
    for (const char of chars)
      for (const equip of char.equips) if (equip.name) shown.delete(equip.name);
  }

  return { shown, simple, processing, isShown, expand, collapse };
});
