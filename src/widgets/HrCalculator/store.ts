import {
  computed,
  inject,
  reactive,
  toValue,
  type InjectionKey,
  type MaybeRefOrGetter,
} from "vue";

import { ALL_TAGS } from "./consts";
import {
  analyze,
  referenceCombos,
  soloGuarantees,
  toOps,
  type Source,
} from "./recruit";
import { readQuery } from "./url";

/**
 * 公招计算的状态：已选标签，结果都由它算出。
 * 根组件 createRecruit 后 provide 下去，子组件 useRecruit 取。
 * source 是响应式的：数据还没到时是空的，标签面板照样出（外壳预渲染也是这样），到了再算结果。
 */
export function createRecruit(source: MaybeRefOrGetter<readonly Source[]>) {
  const ops = computed(() => toOps(toValue(source)));
  const solo = computed(() => soloGuarantees(ops.value));
  const state = reactive({
    sel: new Set<string>(),
    /** 「不保底」那一层前面有保底层时默认收起 */
    lowOpen: false,
  });

  /** 按面板的次序 */
  const picked = computed(() => ALL_TAGS.filter((t) => state.sel.has(t)));
  const result = computed(() => analyze(ops.value, picked.value));
  /** 没选标签时才用得到；computed 惰性求值，用到才算 */
  const reference = computed(() => referenceCombos(ops.value));

  function toggle(tag: string) {
    if (state.sel.has(tag)) state.sel.delete(tag);
    else state.sel.add(tag);
  }
  /** 下一个招募位从头选：「不保底」那一层也跟着收回去 */
  function clear() {
    state.sel.clear();
    state.lowOpen = false;
  }
  function load(search: string) {
    state.sel.clear();
    for (const tag of readQuery(search)) state.sel.add(tag);
  }

  return { ops, solo, state, result, reference, toggle, clear, load };
}

export type Recruit = ReturnType<typeof createRecruit>;
export const recruitKey: InjectionKey<Recruit> = Symbol("HrCalculator");

export function useRecruit() {
  const recruit = inject(recruitKey);
  if (!recruit) throw new Error("useRecruit() 要在公招计算的根组件里面调用");
  return recruit;
}
