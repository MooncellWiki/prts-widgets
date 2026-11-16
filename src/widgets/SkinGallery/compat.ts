import type { WikiSkin } from "./types";

export function wikiBrandName(name: string): string {
  return name.trim().replace(/^0011\//, "0011-");
}

/** 保留源码顺序、期号、同名但不同干员的卡片和显式锚点。 */
export function parseWikiSkins(source: string): WikiSkin[] {
  const entries: WikiSkin[] = [];
  let period = "未分期";
  const tokens =
    /(^===\s*([^=\n]+?)\s*===\s*$)|\{\{\s*时装回廊\/半身像\s*\|([^{}]*)\}\}/gm;
  // 注释里的历史条目不应变成实际卡片。
  for (const match of source.replace(/<!--[\s\S]*?-->/g, "").matchAll(tokens)) {
    if (match[2]) {
      period = match[2].trim();
      continue;
    }
    const params: Record<string, string> = {};
    for (const part of match[3].split("|")) {
      const eq = part.indexOf("=");
      if (eq !== -1)
        params[part.slice(0, eq).trim()] = part.slice(eq + 1).trim();
    }
    if (!params.时装名) continue;
    entries.push({
      skinName: params.时装名,
      charName: params.干员名 || "",
      charNameEn: params.干员外文名 || "",
      skinIndex: params.时装序号 || "1",
      series: wikiBrandName(params.时装系列 || ""),
      anchor: params.锚点 || params.时装名,
      tag: params.时装注释 || "",
      period,
    });
  }
  return entries;
}

export function galleryLink(series: string, anchor?: string): string {
  return `/w/${encodeURIComponent("时装回廊")}/${encodeURIComponent(series)}${anchor ? `#${encodeURIComponent(anchor.replaceAll(" ", "_"))}` : ""}`;
}
