import { computed, inject, reactive, type InjectionKey } from "vue";

import { ALL_TAGS } from "./consts";
import { analyze, soloGuarantees, toOps, type Source } from "./recruit";
import { readQuery } from "./url";

/**
 * 公招计算的状态：已选标签，结果都由它算出。
 * 根组件 createRecruit 后 provide 下去，子组件 useRecruit 取；不走 pinia——外壳预渲染（src/prerender/）不装插件。
 */
export function createRecruit(source: readonly Source[]) {
  const ops = toOps(source);
  const solo = soloGuarantees(ops);
  const state = reactive({ sel: new Set<string>() });

  /** 按面板的次序 */
  const picked = computed(() => ALL_TAGS.filter((t) => state.sel.has(t)));
  const result = computed(() => analyze(ops, picked.value));

  function toggle(tag: string) {
    if (state.sel.has(tag)) state.sel.delete(tag);
    else state.sel.add(tag);
  }
  function clear() {
    state.sel.clear();
  }
  function load(search: string) {
    state.sel.clear();
    for (const tag of readQuery(search)) state.sel.add(tag);
  }

  return { ops, solo, state, result, toggle, clear, load };
}

export type Recruit = ReturnType<typeof createRecruit>;
export const recruitKey: InjectionKey<Recruit> = Symbol("HrCalculator");

export function useRecruit() {
  const recruit = inject(recruitKey);
  if (!recruit) throw new Error("useRecruit() 要在公招计算的根组件里面调用");
  return recruit;
}
