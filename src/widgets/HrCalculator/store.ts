import { computed, inject, reactive, type InjectionKey } from "vue";

import { ALL_TAGS, LONGEST, MAX_TAGS, type DurIndex } from "./consts";
import {
  analyze,
  referenceCombos,
  soloGuarantees,
  toOps,
  type Source,
} from "./recruit";
import { readQuery } from "./url";

/**
 * 公招计算的状态：已选标签 + 招募时限，结果都由它们算出。
 * 根组件 createRecruit 后 provide 下去，子组件 useRecruit 取；不走 pinia——外壳预渲染（src/prerender/）不装插件。
 */
export function createRecruit(source: readonly Source[]) {
  const ops = toOps(source);
  const solo = soloGuarantees(ops);
  const state = reactive({
    sel: new Set<string>(),
    dur: LONGEST as DurIndex,
    /** 「不保底」那一层前面有保底层时默认收起 */
    lowOpen: false,
  });

  /** 按面板的次序 */
  const picked = computed(() => ALL_TAGS.filter((t) => state.sel.has(t)));
  const full = computed(() => state.sel.size >= MAX_TAGS);
  const result = computed(() => analyze(ops, picked.value, state.dur));
  /** 没选标签时才用得到；computed 惰性求值，用到才算 */
  const reference = computed(() => referenceCombos(ops));

  /** 选满 5 个时再加返回 false，由调用方提示 */
  function toggle(tag: string) {
    if (state.sel.has(tag)) state.sel.delete(tag);
    else if (full.value) return false;
    else state.sel.add(tag);
    return true;
  }
  function clear() {
    state.sel.clear();
  }
  function setDur(dur: DurIndex) {
    state.dur = dur;
  }
  function load(search: string) {
    const q = readQuery(search);
    state.sel.clear();
    for (const tag of q.sel) state.sel.add(tag);
    state.dur = q.dur;
  }

  return {
    ops,
    solo,
    state,
    picked,
    full,
    result,
    reference,
    toggle,
    clear,
    setDur,
    load,
  };
}

export type Recruit = ReturnType<typeof createRecruit>;
export const recruitKey: InjectionKey<Recruit> = Symbol("HrCalculator");

export function useRecruit() {
  const recruit = inject(recruitKey);
  if (!recruit) throw new Error("useRecruit() 要在公招计算的根组件里面调用");
  return recruit;
}
