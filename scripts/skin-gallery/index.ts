import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { parseArgs } from "node:util";

import { parse } from "dotenv";

import { edit, getContent, getRevision, login, purgePages } from "../api";
import { viteLoader } from "../dev/widget";

import { expandSlider, replaceCarousel, replaceHome } from "./patch";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    apply: { type: "boolean", default: false },
    credentials: { type: "string" },
    output: { type: "string", default: ".cache/skin-gallery" },
  },
});
const stage = positionals[0];
if (!["slider", "series", "home", "dev"].includes(stage))
  throw new Error(
    "用法：tsx scripts/skin-gallery/index.ts slider|series|home|dev [--apply] [--credentials .env] [--output DIR]",
  );

async function requirePublishedAssets() {
  const widget = await getContent("Widget:SkinGalleryV2");
  if (!widget?.includes("prts-skin-gallery-v2"))
    throw new Error("请先发布 Widget:SkinGalleryV2");
  const scripts = [...widget.matchAll(/<script[^>]+src="([^"]+)"/g)].map(
    (m) => m[1],
  );
  if (
    !scripts.some((url) =>
      url.startsWith("https://static.prts.wiki/widgets/production/"),
    )
  )
    throw new Error("新 Widget 尚未指向正式构建");
  const links = [...widget.matchAll(/<link[^>]+href="([^"]+)"/g)].map(
    (m) => m[1],
  );
  for (const url of [...scripts, ...links]) {
    if (!url.startsWith("https://static.prts.wiki/widgets/production/"))
      throw new Error("Widget 包含非正式构建资源地址");
    const response = await fetch(url, { method: "HEAD" });
    if (!response.ok) throw new Error(`构建资源不可用：${url}`);
  }
  const response = await fetch(
    "https://torappu.prts.wiki/gamedata/latest/excel/skin_table.json",
  );
  if (!response.ok) throw new Error("游戏数据不可用");
  const table = (await response.json()) as {
    brandList: Record<
      string,
      { brandId: string; kvImgIdList: { kvImgId: string }[] }
    >;
  };
  const brands =
    stage === "home"
      ? Object.values(table.brandList)
      : [table.brandList.summer, table.brandList.epoque];
  for (const brand of brands) {
    for (const id of [
      ...brand.kvImgIdList.map((kv) => kv.kvImgId),
      `default_kv_${brand.brandId}`,
    ]) {
      const url = `https://torappu.prts.wiki/assets/skin_kv/${encodeURIComponent(id)}.png`;
      const image = await fetch(url, { method: "HEAD" });
      if (!image.ok || !image.headers.get("content-type")?.startsWith("image/"))
        throw new Error(`KV 资源尚未发布：${id}`);
    }
  }
}

if (values.apply) {
  if (stage === "series" || stage === "home") await requirePublishedAssets();
  const credentials = values.credentials
    ? parse(readFileSync(values.credentials))
    : process.env;
  if (!credentials.WIKI_USERNAME || !credentials.WIKI_PASSWORD)
    throw new Error("缺少 WIKI_USERNAME / WIKI_PASSWORD");
  await login(credentials.WIKI_USERNAME, credentials.WIKI_PASSWORD);
}
const devSource = () =>
  readFileSync(
    new URL("../../templates/SkinGalleryV2.html", import.meta.url),
    "utf8",
  )
    .replace("<head></head>", "")
    .replace(/<script[\s\S]*?<\/script>/, viteLoader("SkinGallery"))
    .replace(
      /<noinclude>[\s\S]*?<\/noinclude>/,
      "<noinclude>{{#Widget:SkinGalleryV2/dev}}</noinclude>",
    );
const pages: [string, (source: string) => string][] =
  stage === "dev"
    ? [["Widget:SkinGalleryV2/dev", devSource]]
    : stage === "slider"
      ? [["Widget:SkinGallery/Slider", expandSlider]]
      : stage === "series"
        ? [
            ["时装回廊/珊瑚海岸", (s) => replaceCarousel(s, "summer")],
            ["时装回廊/时代", (s) => replaceCarousel(s, "epoque")],
          ]
        : [["时装回廊", replaceHome]];
mkdirSync(values.output, { recursive: true });
for (const [title, transform] of pages) {
  const revision = await getRevision(title);
  if (!revision && stage !== "dev") throw new Error(`${title} 不存在`);
  const old = revision || { content: "", revid: 0 };
  if (
    stage === "dev" &&
    old.content &&
    !old.content.includes('class="prts-skin-gallery-v2"')
  )
    throw new Error(`${title} 已存在且不是预期的开发页面`);
  // MediaWiki 会规范化页末空白，提交前做同样处理，确保读回校验可重复。
  const content = transform(old.content).trimEnd();
  const base = path.join(
    values.output,
    `${title.replaceAll(/[/:]/g, "_")}.${old.revid}`,
  );
  writeFileSync(`${base}.before.wiki`, old.content);
  writeFileSync(`${base}.after.wiki`, content);
  if (content === old.content) {
    console.log(`${title}: 无变化（rev ${old.revid}）`);
    continue;
  }
  console.log(
    `${values.apply ? "编辑" : "预览"} ${title}，基于 rev ${old.revid}；备份及目标稿：${base}.*.wiki`,
  );
  if (values.apply) {
    const result = await edit(
      title,
      content,
      stage === "slider"
        ? "修复时装回廊宣传图截断：扩展为 default + 图1–20，保留倒序及空槽隐藏"
        : "时装回廊迁移至 SkinGalleryV2，保留运营表格和旧期号数据源",
      { baserevid: old.revid, nocreate: !!revision, createonly: !revision },
    );
    const current = await getRevision(title);
    if (current?.content !== content)
      throw new Error(`${title} 编辑后内容校验失败`);
    writeFileSync(
      `${base}.result.json`,
      JSON.stringify({ title, before: old.revid, after: result.newrevid }),
    );
    console.log(`${title}: 已写入 rev ${result.newrevid}`);
  }
}
if (values.apply) {
  if (stage === "slider") {
    await purgePages(["Widget:SkinGallery/Slider"]);
    await purgePages(["模板:时装回廊/轮播"]);
    const response = await fetch(
      "https://torappu.prts.wiki/gamedata/latest/excel/skin_table.json",
    );
    if (!response.ok) throw new Error("无法读取品牌列表以刷新系列页缓存");
    const table = (await response.json()) as {
      brandList: Record<string, { brandName: string }>;
    };
    for (const { brandName } of Object.values(table.brandList)) {
      const title = `时装回廊/${brandName.trim().replace(/^0011\//, "0011-")}`;
      await purgePages([title]);
      console.log(`已刷新 ${title}`);
    }
  } else await purgePages(pages.map(([title]) => title));
}
