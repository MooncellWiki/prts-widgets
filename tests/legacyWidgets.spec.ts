import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  gateTemplate,
  LEGACY_BASE,
  LEGACY_WIDGETS,
  legacyFiles,
  takeAssetTags,
} from "../scripts/legacy";

import type { IBrowserSettings } from "happy-dom";

const BASE = "https://static.prts.wiki/widgets/production/";

/** vite build 产出的模板（预渲染之前）的样子 */
const built = (name: string) => `<includeonly><div id="root"></div><head>
  <script type="module" crossorigin src="${BASE}polyfills.AAAAAAAA.js"></script>
  <script type="module" crossorigin src="${BASE}${name}.BBBBBBBB.js"></script>
  <link rel="modulepreload" crossorigin href="${BASE}common.CCCCCCCC.js">
  <link rel="modulepreload" crossorigin href="${BASE}vendor.DDDDDDDD.js">
  <link rel="stylesheet" crossorigin href="${BASE}style.EEEEEEEE.css">
</head></includeonly><noinclude>{{Documentation}}[[分类:由机器人维护的小部件]]</noinclude>`;

const NEW_SHELL = '<div class="ak-scope hr">新版外壳</div>';

/**
 * 按 update.ts 发布到 Widget 页面、再被页面解析的样子放进 body，跑一遍引导脚本。
 * 插进去的 <link> / <script> 只看不加载（见 beforeAll）。
 */
function runGate(template: string, skin: string, shell = "") {
  document.body.className = skin;
  document.body.innerHTML = template
    .replace(/<noinclude>.*<\/noinclude>|<\/?includeonly>|<\/?head>/g, "")
    .replace('<div id="root"></div>', `<div id="root">${shell}</div>`);
  const gate = document.body.querySelector("script")!;
  Object.defineProperty(document, "currentScript", {
    configurable: true,
    get: () => gate,
  });

  new Function(gate.textContent!)();
  delete (document as { currentScript?: unknown }).currentScript;

  const hrefs = (rel: string) =>
    Array.from(
      document.body.querySelectorAll<HTMLLinkElement>(`link[rel="${rel}"]`),
      (link) => link.getAttribute("href"),
    );
  const modules = document.body.querySelectorAll('script[type="module"]');
  return {
    root: document.getElementById("root")!,
    css: hrefs("stylesheet"),
    preload: hrefs("modulepreload"),
    modules: Array.from(modules, (script) => script.textContent),
    /** 插入的东西都在引导脚本前面，与原来的标签同一位置 */
    allBeforeGate: Array.from(
      document.body.querySelectorAll("link, div:not(#root), script"),
    ).every(
      (el) =>
        el === gate ||
        !!(el.compareDocumentPosition(gate) & Node.DOCUMENT_POSITION_FOLLOWING),
    ),
  };
}

describe("takeAssetTags", () => {
  it("按次序取出入口、预加载与样式，模板其余部分原样留下", () => {
    const { html, at, assets } = takeAssetTags(built("CharList"));
    expect(assets).toEqual({
      scripts: [`${BASE}polyfills.AAAAAAAA.js`, `${BASE}CharList.BBBBBBBB.js`],
      preload: [`${BASE}common.CCCCCCCC.js`, `${BASE}vendor.DDDDDDDD.js`],
      css: [`${BASE}style.EEEEEEEE.css`],
    });
    expect(html).toBe(
      '<includeonly><div id="root"></div><head>\n</head></includeonly><noinclude>{{Documentation}}[[分类:由机器人维护的小部件]]</noinclude>',
    );
    expect(html.slice(0, at)).toBe('<includeonly><div id="root"></div><head>');
  });

  it("认不出的标签直接报错，不静默漏掉资源", () => {
    expect(() =>
      takeAssetTags(
        built("CharList").replace(
          "</head>",
          `<script type="module" src="${BASE}x.js"></script></head>`,
        ),
      ),
    ).toThrow("认不出");
    expect(() => takeAssetTags('<div id="root"></div><head></head>')).toThrow(
      "入口",
    );
  });
});

describe("gateTemplate", () => {
  it("资源标签换成一段内联脚本，脚本里没有 < 和 Widgets 的 Smarty 定界符", () => {
    for (const [name, legacy] of Object.entries(LEGACY_WIDGETS)) {
      const html = gateTemplate(built(name), legacy);
      expect(html.match(/<script/g)).toHaveLength(1);
      expect(html).not.toContain("<link");
      expect(html).not.toContain("<!--{");
      const code = html.slice(
        html.indexOf("<script>") + 8,
        html.indexOf("</script>"),
      );
      expect(code).not.toContain("<");
    }
  });
});

describe("引导脚本", () => {
  // vitest 的 happy-dom 环境把 window.happyDOM 挂在全局上，DOM 类型里没有它
  const { settings } = (
    window as unknown as { happyDOM: { settings: IBrowserSettings } }
  ).happyDOM;
  const saved = { ...settings };
  beforeAll(() => {
    settings.disableJavaScriptEvaluation = true;
    settings.disableJavaScriptFileLoading = true;
    settings.disableCSSFileLoading = true;
    settings.handleDisabledFileLoadingAsSuccess = true;
  });
  afterAll(() => {
    Object.assign(settings, saved);
    document.body.className = "";
    document.body.innerHTML = "";
  });

  it("Arknights 皮肤：插回本次构建的资源，外壳不动", () => {
    const html = gateTemplate(
      built("HrCalculator"),
      LEGACY_WIDGETS.HrCalculator,
    );
    const page = runGate(
      html,
      "skin-arknights skin-theme-clientpref-day",
      NEW_SHELL,
    );
    expect(page.root.innerHTML).toBe(NEW_SHELL);
    expect(page.css).toEqual([`${BASE}style.EEEEEEEE.css`]);
    expect(page.preload).toEqual([
      `${BASE}common.CCCCCCCC.js`,
      `${BASE}vendor.DDDDDDDD.js`,
    ]);
    expect(page.modules).toEqual([
      `import "${BASE}polyfills.AAAAAAAA.js";import "${BASE}HrCalculator.BBBBBBBB.js";`,
    ]);
    expect(page.allBeforeGate).toBe(true);
  });

  it.each([
    "skin-vector skin-vector-legacy",
    "skin-vector-2022",
    "skin-minerva",
  ])("%s：换成改版前的产物与外壳", (skin) => {
    const legacy = LEGACY_WIDGETS.HrCalculator;
    const page = runGate(
      gateTemplate(built("HrCalculator"), legacy),
      skin,
      NEW_SHELL,
    );
    const expected = document.createElement("div");
    expected.innerHTML = legacy.shell!;
    expect(page.root.innerHTML).toBe(expected.innerHTML);
    expect(page.root.querySelector(".hr-calculator-widget")).not.toBeNull();
    expect(page.css).toEqual(legacy.assets.css.map((f) => LEGACY_BASE + f));
    expect(page.preload).toEqual(
      legacy.assets.preload.map((f) => LEGACY_BASE + f),
    );
    expect(page.modules).toEqual([
      legacy.assets.scripts.map((f) => `import "${LEGACY_BASE}${f}";`).join(""),
    ]);
    expect(page.allBeforeGate).toBe(true);
  });

  it("旧版干员一览：补回 #filter-filter，旧包能照原样读出筛选项", () => {
    runGate(
      gateTemplate(built("CharList"), LEGACY_WIDGETS.CharList),
      "skin-vector",
    );
    // 旧入口的读法：JSON.parse(#filter-filter 的正文).filters
    const { filters } = JSON.parse(
      document.querySelector("#filter-filter")?.textContent ?? "",
    );
    expect(filters.map((g: { title: string }) => g.title)).toEqual([
      "筛选",
      "六维筛选",
      "势力/出身地/种族筛选",
    ]);
    expect(
      (document.querySelector("#filter-filter") as HTMLElement).style.display,
    ).toBe("none");
  });

  it.each(["skin-vector skin-vector-legacy", "skin-minerva"])(
    "旧版敌人一览（%s）：换资源并清掉 #root 里新版的外壳",
    (skin) => {
      const legacy = LEGACY_WIDGETS.EnemiesListV2;
      const page = runGate(
        gateTemplate(built("EnemiesListV2"), legacy),
        skin,
        NEW_SHELL,
      );
      expect(page.root.innerHTML).toBe("");
      expect(page.css).toEqual(legacy.assets.css.map((f) => LEGACY_BASE + f));
      expect(page.preload).toEqual(
        legacy.assets.preload.map((f) => LEGACY_BASE + f),
      );
      expect(page.modules).toEqual([
        legacy.assets.scripts
          .map((f) => `import "${LEGACY_BASE}${f}";`)
          .join(""),
      ]);
      expect(page.allBeforeGate).toBe(true);
    },
  );

  it("新版敌人一览：Arknights 皮肤上外壳不动", () => {
    const page = runGate(
      gateTemplate(built("EnemiesListV2"), LEGACY_WIDGETS.EnemiesListV2),
      "skin-arknights",
      NEW_SHELL,
    );
    expect(page.root.innerHTML).toBe(NEW_SHELL);
    expect(page.css).toEqual([`${BASE}style.EEEEEEEE.css`]);
  });

  it("Arknights 皮肤上不补旧版的数据块", () => {
    runGate(
      gateTemplate(built("CharList"), LEGACY_WIDGETS.CharList),
      "skin-arknights",
    );
    expect(document.querySelector("#filter-filter")).toBeNull();
  });
});

describe("legacyFiles", () => {
  it("prune 保留各个旧版的全部产物", () => {
    const files = legacyFiles();
    for (const { assets } of Object.values(LEGACY_WIDGETS))
      for (const file of [...assets.scripts, ...assets.preload, ...assets.css])
        expect(files).toContain(file);
    expect(files).toContain("CharList._UhB_qCb.js");
    expect(files).toContain("HrCalculator.Bi5TIb90.js");
    expect(files).toContain("EnemiesListV2.ObDWedKn.js");
  });
});
