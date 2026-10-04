import { GRADES, type Grade, type Sort } from "./consts";

import type { Enemy } from "./enemy";

/** 等级 → 可比的数（SS 最大）；? 等认不出的没有数 */
function gradeRank(grade: string): number | null {
  const i = GRADES.indexOf(grade as Grade);
  return i === -1 ? null : GRADES.length - i;
}

/**
 * 排序 = 排序项 × 升降。
 * 游戏图鉴只有一种排法（EnemyHandBookEverViewModel.CompareTo 比 sortId）加一枚升降钮；
 * 名称与八项属性的等级是改版前表头上就能排的。同值时按图鉴顺序。
 */
export function sortEnemies(list: readonly Enemy[], sort: Sort): Enemy[] {
  const { key, dir } = sort;
  const out = list.slice();
  const byIndex = (a: Enemy, b: Enemy) => a.sortId - b.sortId;

  if (key === "index") return out.sort((a, b) => byIndex(a, b) * dir);
  if (key === "name")
    return out.sort(
      (a, b) => a.name.localeCompare(b.name, "zh") * dir || byIndex(a, b),
    );

  return out.sort((a, b) => {
    const x = gradeRank(a.stats[key]);
    const y = gradeRank(b.stats[key]);
    // 没有等级的不分升降都排最后
    const primary =
      x === null || y === null
        ? Number(x === null) - Number(y === null)
        : (x - y) * dir;
    return primary || byIndex(a, b);
  });
}
