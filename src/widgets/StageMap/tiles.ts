import TILE_INFO from "./tile-info.json";

import type { TileData } from "./level";

/**
 * 格子的底色按属性分，不按 tileKey：同一种功能地块既有铺在地面上的，也有铺在高台上的（tile_grass / tile_healing …）。
 *   high   高台（HIGHLAND，能放远程）
 *   ground 地面（LOWLAND，能走，能放近战）
 *   floor  不可放置位（LOWLAND，能走，不能放）
 *   fence  围栏（LOWLAND，不能走，能放近战）
 *   void   禁入区（不能走也不能放：tile_forbidden、深水、空袭侵入点所在的那种高处）
 *   none   tile_empty：地图上没有这一格
 */
export type Terrain = "high" | "ground" | "floor" | "fence" | "void" | "none";

/** 地块上另画的标记：起点 / 终点 / 空袭点 / 通道 / 地穴有专门的画法，其余功能地块画角标 */
export type TileMark =
  "start" | "end" | "flystart" | "telin" | "telout" | "hole" | "special";

const walkable = (t: TileData) =>
  t.passableMask === "ALL" || t.passableMask === "WALK_ONLY";

export function terrainOf(t: TileData): Terrain {
  if (t.tileKey === "tile_empty") return "none";
  const buildable = t.buildableType !== "NONE";
  if (t.heightType === "HIGHLAND") return buildable ? "high" : "void";
  if (walkable(t)) return buildable ? "ground" : "floor";
  return buildable ? "fence" : "void";
}

/** 只是底色、没有额外含义的地块 */
const PLAIN = new Set([
  "tile_road",
  "tile_floor",
  "tile_wall",
  "tile_forbidden",
  "tile_empty",
]);
const MARKS: Record<string, TileMark> = {
  tile_start: "start",
  tile_ftstart: "start",
  tile_end: "end",
  tile_end_cooperate: "end",
  tile_flystart: "flystart",
  tile_telin: "telin",
  tile_telout: "telout",
  tile_hole: "hole",
};

export function markOf(t: TileData): TileMark | null {
  if (PLAIN.has(t.tileKey)) return null;
  return MARKS[t.tileKey] ?? "special";
}

/** 底色的名字：同游戏 stage_table.tileInfo 里四种基础地块的叫法 */
export const TERRAIN_NAMES: Record<Exclude<Terrain, "none">, string> = {
  high: "高台",
  ground: "平地",
  floor: "不可放置位",
  fence: "围栏",
  void: "禁入区",
};

/** stage_table.tileInfo 的快照（名称、说明，富文本标签已去掉）：[名称, 说明] */
const INFO: Record<string, string[]> = TILE_INFO;

export interface TileInfo {
  name: string;
  description: string;
}

/** tileInfo 里没有的（多是活动专属地块，游戏里也不在地块说明里出现）按底色起名，说明留空 */
export function tileInfo(t: TileData): TileInfo {
  const info = INFO[t.tileKey];
  if (info) return { name: info[0], description: info[1] };
  const terrain = terrainOf(t);
  return {
    name: terrain === "none" ? "" : TERRAIN_NAMES[terrain],
    description: "",
  };
}
