import { getImagePath } from "@/utils/utils";

export interface ParsedMaterial {
  name: string;
  src: string;
  href: string;
  count?: string;
}

/** 把 cargo 的材料 wikitext 拆成 AkItem 需要的字段。 */
export function parseMaterials(res: string): ParsedMaterial[] {
  const blocks =
    /<div[^>]*class="[^"]*prts-item-icon[^"]*"[^>]*>([\s\S]*?)<\/div>/g;
  const items: ParsedMaterial[] = [];
  for (const block of res.matchAll(blocks)) {
    const content = block[1] ?? "";
    const file = content.match(/\[\[文件:道具 带框 (.*?)\.png([^\]]*)\]\]/);
    if (!file) continue;
    const imageName = file[1]!.trim();
    const attrs = file[2] ?? "";
    const link = attrs.match(/\|link=([^|\]]+)/)?.[1]?.trim() || imageName;
    const count = content
      .match(
        /<span[^>]*class="[^"]*prts-item-quantity-label[^"]*"[^>]*>([\s\S]*?)<\/span>/,
      )?.[1]
      ?.replace(/<[^>]*>/g, "")
      .trim();
    items.push({
      name: link,
      src: getImagePath(`道具_带框_${imageName}.png`),
      href: `/w/${link}`,
      count: count || undefined,
    });
  }
  return items;
}

export function recoverHTML(res: string): string {
  return res
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll(/&#(.*?);/g, "`");
}

export function processLink(res: string): string {
  const regexp = /\[\[(.*?)(?=[\]|])\|?(.*?)]]/g;
  const result = res.matchAll(regexp);
  for (const group of result) {
    res = res.replace(
      group[0],
      () =>
        `<a href="/w/${group[1]}">${group[2] === "" ? group[1] : group[2]}</a>`,
    );
  }
  return res;
}

// 修复攻击范围Widget异常的临时方法
export async function fixAtkRange(
  res: string,
  char: string,
  name: string,
  item: string = "特性",
) {
  const regexp = /.START_WIDGET.*?END_WIDGET/g;
  const resp = await fetch(
    `/api.php?${new URLSearchParams({
      action: "parse",
      format: "json",
      page: char,
      prop: "sections",
    })}`,
  );
  const json = await resp.json();
  const sections = json.parse?.sections as Array<any>;
  const sectionIndex = sections.find((v) => v.line === name)?.index;
  if (!sectionIndex) return res;

  const contentResp = await fetch(
    `/index.php?${new URLSearchParams({
      action: "raw",
      title: char,
      section: sectionIndex,
    })}`,
  );
  const text = await contentResp.text();
  const targetText = text.slice(text.search(item));
  const rangeType =
    targetText.match(/{{攻击范围\|(.*?)}}/)?.at(1) ??
    targetText.match(/{{popup\/range\|(.*?)}}/)?.at(1) ??
    "";

  const rangeResp = await fetch(
    `/api.php?${new URLSearchParams({
      action: "parse",
      format: "json",
      text: `{{攻击范围|${rangeType}}}`,
      prop: "text",
    })}`,
  );
  const rangeJson = await rangeResp.json();
  const rangeText = rangeJson.parse?.text["*"];
  const rangeDoc = new DOMParser().parseFromString(rangeText, "text/html");
  const range = rangeDoc.querySelector("p")?.innerHTML;

  return res.replaceAll(regexp, () => range ?? "");
}
