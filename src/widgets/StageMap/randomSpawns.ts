import type { ActionData } from "./level";

type Requirements = Map<string, ActionData>;
interface CountTerm {
  count: number;
  requires: Requirements;
}
interface CountRange {
  min: number;
  max: number;
}

/**
 * 2.7.91：RandomGroupSchedulerPreprocessor.DoPreprocess 0x9A31A0、
 * Roguelike2SchedulerPreprocessor.DoPreprocess 0x971190：先在完整阶段里抽签，之后 Scheduler
 * 才检查 hiddenGroup。未抽中的选项（抽中空 key 时包括它自己）会删除同阶段的整个 pack。
 * 所以一个包保留下来的条件是：所有带这个包名的抽签选项都必须抽中，且 key 非空。
 */
export function randomSpawns(actions: ActionData[]) {
  const groups = new Map<string, ActionData[]>();
  for (const a of actions)
    if (
      a.randomSpawnGroupKey &&
      (a.actionType === "SPAWN" ||
        a.actionType === "ACTIVATE_PREDEFINED" ||
        a.actionType === "EMPTY")
    ) {
      const list = groups.get(a.randomSpawnGroupKey) ?? [];
      list.push(a);
      groups.set(a.randomSpawnGroupKey, list);
    }

  const weights = new Map<ActionData, number>();
  const choices = new Map<string, ActionData[]>();
  for (const [key, list] of groups) {
    const total = list.reduce((sum, a) => sum + Math.max(0, a.weight), 0);
    for (const a of list)
      // RandomExtensions.UniformWithWeight 0x477CC50：总权重为 0 时返回第一项。
      weights.set(
        a,
        total > 0 ? Math.max(0, a.weight) / total : Number(a === list[0]),
      );
    choices.set(
      key,
      list.filter((a) => weights.get(a)! > 0),
    );
  }

  function requireChoice(requires: Requirements, a: ActionData) {
    const key = a.randomSpawnGroupKey!;
    if (
      !a.key ||
      !weights.get(a) ||
      (requires.has(key) && requires.get(key) !== a)
    )
      return false;
    requires.set(key, a);
    return true;
  }

  const packs = new Map<string, Requirements | null>();
  for (const list of groups.values())
    for (const a of list) {
      const pack = a.randomSpawnGroupPackKey;
      if (!pack) continue;
      const requires = packs.has(pack) ? packs.get(pack)! : new Map();
      packs.set(pack, requires && requireChoice(requires, a) ? requires : null);
    }

  const conditions = new Map<ActionData, Requirements | null>();
  for (const a of actions) {
    const pack = a.randomSpawnGroupPackKey
      ? packs.get(a.randomSpawnGroupPackKey)
      : undefined;
    const requires = pack === null ? null : new Map(pack ?? []);
    conditions.set(
      a,
      requires && (!weights.has(a) || requireChoice(requires, a))
        ? requires
        : null,
    );
  }

  function chance(a: ActionData): number | null {
    const requires = conditions.get(a)!;
    if (!requires) return 0;
    if (requires.size === 0) return null;
    let probability = 1;
    for (const choice of requires.values()) probability *= weights.get(choice)!;
    return probability;
  }

  /** 对有关联的抽签条件求范围；没有关联的组分别求和，避免枚举整阶段的笛卡尔积。 */
  function countRange(counted: (a: ActionData) => number): CountRange {
    let fixed = 0;
    const terms: CountTerm[] = [];
    const neighbors = new Map<string, Set<string>>();
    for (const a of actions) {
      const count = counted(a);
      const condition = conditions.get(a);
      if (!count || !condition) continue;
      const requires = new Map(
        [...condition].filter(([, choice]) => weights.get(choice)! < 1),
      );
      if (requires.size === 0) {
        fixed += count;
        continue;
      }
      terms.push({ count, requires });
      const keys = [...requires.keys()];
      for (const key of keys) {
        const adjacent = neighbors.get(key) ?? new Set<string>();
        adjacent.add(keys[0]);
        neighbors.set(key, adjacent);
        neighbors.get(keys[0])!.add(key);
      }
    }

    function rangeOf(pending: CountTerm[]): CountRange {
      if (pending.length === 0) return { min: 0, max: 0 };
      const key = pending[0].requires.keys().next().value!;
      let min = Infinity;
      let max = -Infinity;
      for (const choice of choices.get(key)!) {
        let count = 0;
        const rest: CountTerm[] = [];
        for (const term of pending) {
          const required = term.requires.get(key);
          if (required && required !== choice) continue;
          const requires = new Map(term.requires);
          requires.delete(key);
          if (requires.size === 0) count += term.count;
          else rest.push({ count: term.count, requires });
        }
        const range = rangeOf(rest);
        min = Math.min(min, count + range.min);
        max = Math.max(max, count + range.max);
      }
      return { min, max };
    }

    const result = { min: fixed, max: fixed };
    const seen = new Set<string>();
    for (const key of neighbors.keys()) {
      if (seen.has(key)) continue;
      const component = new Set<string>();
      const queue = [key];
      for (const group of queue) {
        if (component.has(group)) continue;
        component.add(group);
        seen.add(group);
        queue.push(...neighbors.get(group)!);
      }
      const range = rangeOf(
        terms.filter((t) => component.has(t.requires.keys().next().value!)),
      );
      result.min += range.min;
      result.max += range.max;
    }
    return result;
  }

  return { chance, countRange };
}
