import { getImagePath } from "@/utils/utils";

export function processMaterial(res: string): string {
  const regexp = /\[\[文件:道具 带框 (.*?)\.png(.*?)]]/g;
  const result = res.matchAll(regexp);
  for (const group of result) {
    res = res.replace(
      group[0],
      `<a href="/w/${group[1]}"><img src="${getImagePath(`道具_带框_${group[1]}.png`)}" width="45" /></a>`,
    );
  }
  return res;
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
      `<a href="/w/${group[1]}">${group[2] === "" ? group[1] : group[2]}</a>`,
    );
  }
  return res;
}

// 修复攻击范围Widget异常的临时方法
export async function fixAtkRange(res: string, char: string, name: string) {
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
  const rangeType = text.match(/{{攻击范围\|(.*?)}}/)?.at(1) ?? "";

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

  return res.replaceAll(regexp, range ?? "");
}

export function updateTippy() {
  for (const e of Array.from(document.querySelectorAll(".mc-tooltips"))) {
    if (!e.children || e.children.length < 2) continue;
    (e.children[1] as HTMLElement).style.display = "block";
    // @ts-expect-error tippy
    tippy6(e.children[0], {
      content: e.children[1],
      arrow: true,
      theme: "light-border",
      size: "large",
      maxWidth: Number.parseInt((e.children[1] as HTMLElement).dataset.size!),
      trigger:
        (e.children[1] as HTMLElement).dataset.trigger || "mouseenter focus",
    });
  }
}
