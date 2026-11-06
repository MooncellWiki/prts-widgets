import { getImagePath } from "@/utils/utils";

import {
  CHARACTER_MAP_URL,
  parseCharacterMap,
  type CharacterLinkMap,
} from "../StoryAssetExplorer/utils";
import { resolveStoryCharacterAssetByKey } from "../StoryPlayer/engine/asset";

import type { StoryFaceRect } from "../StoryPlayer/engine/types";

export interface PortraitFace {
  /** character.json 里的表情名（如 `1$1`） */
  name: string;
  url: string;
}

export type PortraitBody =
  | { kind: "single"; id: string; url: string }
  | {
      kind: "overlay";
      id: string;
      baseUrl: string;
      faceRect: StoryFaceRect;
      faces: PortraitFace[];
    };

/**
 * 模板传来的 key 列表，逗号分隔。来源有两种：
 * Module:GetNpcKeyData 里的剧情 key（`avg_npc_048`），以及条目手写的 `id=`，
 * 后者有的带空格（`avg npc 041`），有的写成 wiki 文件名前缀（`Avg avg npc 245`）。
 */
export function parseKeys(raw: string): string[] {
  return raw
    .split(",")
    .map((key) => key.trim().replaceAll(" ", "_").replace(/^Avg_/, ""))
    .filter(Boolean);
}

const baseCollator = new Intl.Collator("en", { numeric: true });

/**
 * character.json 里属于 key 的 base：同名，或 key 后面紧跟 `_` `-` `$`。
 * 与模板:剧情立绘 原来按文件名匹配的规则（`key[_\-\$]`）一致，
 * `avg_npc_10` 不会带上 `avg_npc_102`。
 * parseCharacterMap 把 base 统一成了小写（剧情脚本按小写引用），key 也按小写比。
 */
export function basesOf(key: string, bases: Iterable<string>): string[] {
  const lower = key.toLowerCase();
  const matched: string[] = [];
  for (const base of bases) {
    if (
      base === lower ||
      (base.startsWith(lower) && "_-$".includes(base.charAt(lower.length)))
    )
      matched.push(base);
  }
  return matched.sort(baseCollator.compare);
}

/**
 * 同一张立绘在 wiki 上的文件名。条目里的 `nottitleregexp` 是按 wiki 文件名写的，
 * 排除规则照旧对它匹配。叠图表情（名字以数字开头，如 `1$1`）是 `Avg_<base>-<表情>.png`，
 * 其余是 `Avg_<名字>.png`；文件名里不能有 `#`，上传时换成了 `-`。
 */
export function wikiFileName(base: string, name: string): string {
  const stem = /^\d/.test(name) ? `${base}-${name}` : name;
  return `Avg_${stem.replaceAll("#", "-")}.png`;
}

/** `nottitleregexp` → 正则。DPL 原来把空格当下划线，写错的正则当没写。 */
export function parseExclude(raw: string): RegExp | null {
  const source = raw.trim().replaceAll(" ", "_");
  if (!source) return null;
  try {
    return new RegExp(source);
  } catch {
    return null;
  }
}

function assetUrl(path: string): string {
  const url = resolveStoryCharacterAssetByKey(path);
  if (!url) throw new Error("character asset path is empty");
  return url;
}

/**
 * 按 key 顺序列出立绘：独立全身图各占一个，叠图角色每个表情组占一个、组内表情放进 faces。
 * 同一 base 里按 character.json 的条目顺序。
 */
export function buildBodies(
  keys: readonly string[],
  links: CharacterLinkMap,
  exclude: RegExp | null = null,
): PortraitBody[] {
  const bodies: PortraitBody[] = [];
  const seen = new Set<string>();

  for (const key of keys) {
    for (const base of basesOf(key, links.keys())) {
      // 两个 key 对到同一个 base（如 char_002_amiya 与 char_002_amiya_1）时只列一次
      if (seen.has(base)) continue;
      seen.add(base);

      const node = links.get(base);
      if (!node) continue;
      const groups = new Map<
        number,
        Extract<PortraitBody, { kind: "overlay" }>
      >();

      for (const [name, item] of node.items) {
        // 资源路径的目录名保留原始大小写（如 npc_2001_Aya_1），wiki 文件名按它拼
        const dir = (item.image ?? item.face ?? base).split("/")[0];
        if (exclude?.test(wikiFileName(dir, name))) continue;

        if (item.image) {
          bodies.push({
            kind: "single",
            id: `${base}#${name}`,
            url: assetUrl(item.image),
          });
          continue;
        }

        const overlay = item.face ? node.overlays.get(item.group) : undefined;
        if (!item.face || !overlay) continue;
        let body = groups.get(item.group);
        if (!body) {
          body = {
            kind: "overlay",
            id: `${base}$${item.group + 1}`,
            baseUrl: assetUrl(overlay.base),
            faceRect: overlay.faceRect,
            faces: [],
          };
          groups.set(item.group, body);
          bodies.push(body);
        }
        body.faces.push({ name, url: assetUrl(item.face) });
      }
    }
  }
  return bodies;
}

/**
 * 条目手写的 wiki 文件（`文件=Npc doctor.png`），逗号分隔，排在 torappu 的立绘后面。
 * 给不是解包资源的图用，如博士的 Npc_doctor.png。
 */
export function fileBodies(raw: string): PortraitBody[] {
  return raw
    .split(",")
    .map((name) =>
      name
        .trim()
        .replace(/^(?:文件|File):/i, "")
        .replaceAll(" ", "_"),
    )
    .filter(Boolean)
    .map((name) => {
      const filename = name.charAt(0).toUpperCase() + name.slice(1);
      return {
        kind: "single",
        id: `File:${filename}`,
        url: getImagePath(filename),
      };
    });
}

let characterMap: Promise<CharacterLinkMap> | null = null;

/** 整页共用一份 character.json（gzip 后约 130 KB）；失败后清掉缓存，下次重试会重新拉。 */
export function loadCharacterMap(): Promise<CharacterLinkMap> {
  characterMap ??= fetch(CHARACTER_MAP_URL)
    .then(async (response) => {
      if (!response.ok) throw new Error(`character.json ${response.status}`);
      return parseCharacterMap(await response.json());
    })
    .catch((error: unknown) => {
      characterMap = null;
      throw error;
    });
  return characterMap;
}
