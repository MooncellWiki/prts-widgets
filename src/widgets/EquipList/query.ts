import {
  ADVANCED_FILTER_MODES,
  filterModeDef,
  isFilterModeActive,
  type ActiveEquipFilterMode,
  type EquipFilterSelection,
  type EquipSort,
  type SortStatKey,
} from "./filters";

import type { EquipRow } from "./types";

/** 一种筛选方式命中不命中；值没选时放行。 */
export function matchesFilter(
  data: Record<string, string>,
  mode: ActiveEquipFilterMode,
  values: readonly string[],
): boolean {
  if (!isFilterModeActive(values)) return true;
  const { kind } = filterModeDef(mode);
  const selected = values.filter((value) => value !== "");
  if (selected.length === 0) return true;

  switch (mode) {
    case "talent": {
      const match =
        (data.talent2 ?? "").includes("新增天赋") ||
        (data.talent3 ?? "").includes("新增天赋");
      return selected[0] === "no" ? !match : match;
    }
    case "trait": {
      const match = !!data.add;
      return selected[0] === "no" ? !match : match;
    }
    case "type": {
      return selected.some((value) =>
        (data.type ?? "").match(new RegExp(`-${value}`, "i")),
      );
    }
    case "addtime": {
      return selected.includes(data.addtime ?? "");
    }
    case "mission2opt": {
      return (data.mission2opt ?? "").includes(selected[0]!);
    }
    default: {
      // 数值筛选：有这一项加成 = 字段不是 "0"
      if (kind !== "stat") return true;
      const match = data[mode] !== "0";
      return selected[0] === "no" ? !match : match;
    }
  }
}

/** 不同筛选方式之间是「且」。 */
export function matchesFilters(
  data: Record<string, string>,
  selection: EquipFilterSelection,
): boolean {
  return ADVANCED_FILTER_MODES.every((mode) =>
    matchesFilter(data, mode, selection[mode]),
  );
}

/** 搜索干员名称（含英 / 日文名）或模组名称；空搜索放行。 */
export function matchesEquipSearch(
  char: { name: string; nameEN?: string; nameJP?: string },
  equip: { name?: string },
  query: string,
): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return (
    [char.name, char.nameEN, char.nameJP].some((name) =>
      name?.toLowerCase().includes(needle),
    ) || (equip.name ?? "").toLowerCase().includes(needle)
  );
}

const addtime = (row: EquipRow): number =>
  Number.parseInt(row.data.addtime ?? "0") || 0;

const operatorRarity = (row: EquipRow): number =>
  Number.parseInt(String(row.oprarity)) || 0;

const statValue = (row: EquipRow, mode: SortStatKey): number => {
  const raw = row.data[`${mode}3`];
  return raw ? Number(raw) : 0;
};

function compareRows(x: EquipRow, y: EquipRow, sort: EquipSort): number {
  switch (sort.key) {
    case "default": {
      // 干员稀有度；同稀有度按干员序号倒序
      const rx = operatorRarity(x);
      const ry = operatorRarity(y);
      return rx === ry ? y.opid - x.opid : (rx - ry) * sort.dir;
    }
    case "addtime": {
      const ax = addtime(x);
      const ay = addtime(y);
      return ax === ay ? y.opid - x.opid : (ax - ay) * sort.dir;
    }
    default: {
      // 数值排序：时间 / 费用默认升序，其余默认降序
      const numx = statValue(x, sort.key);
      const numy = statValue(y, sort.key);
      return numx === numy ? y.opid - x.opid : (numx - numy) * sort.dir;
    }
  }
}

/** 按当前的排序方式排好（不改传入的数组）。 */
export function sortEquipRows(rows: EquipRow[], sort: EquipSort): EquipRow[] {
  return [...rows].sort((x, y) => compareRows(x, y, sort));
}
