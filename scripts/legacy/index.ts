import { readFileSync } from "node:fs";

/**
 * Arknights 以外的皮肤（Vector / Vector 2022 / Minerva …）上，干员一览、公招计算、敌人一览照旧用改版前的组件。
 *
 * 仓库里不留旧代码，直接引 OSS 上改版前最后一次构建的产物：带 hash 的文件内容不变，upload 只增不删，
 * 它们一直在。构建时 vite.config.ts 的 legacySkinGate 把这几个模板里 Vite 注入的 <script> / <link>
 * 换成一段内联引导脚本（renderSkinGate），页面解析到那里时按 body.skin-arknights 挑新版或旧版那组插回原位。
 * 分流口径与 模板:干员筛选 的两份提示框（.ol-notes / .ol-notes-legacy）一致。
 *
 * scripts/prune.ts 按这份清单保留旧产物，删了旧皮肤上这几页就白屏。
 */

export interface WidgetAssets {
  /** 依次执行的模块：@vitejs/plugin-legacy 的 polyfills 在前，入口在后 */
  scripts: string[];
  /** 入口静态引入的 chunk，提前 modulepreload */
  preload: string[];
  css: string[];
}

export interface LegacyWidget {
  /** 改版前最后一版 Widget 页面的修订号，下面的文件清单照抄它的 <script> / <link> */
  revision: number;
  /** 文件名，都在 LEGACY_BASE 下；是入口完整的依赖闭包（没有动态 import，CSS 里没有相对路径资源） */
  assets: WidgetAssets;
  /**
   * 旧版的预渲染外壳，旧皮肤上换掉 #root 里新版的外壳（新版外壳靠皮肤的组件样式，旧皮肤上没有）；
   * 空串 = 只清掉新版的外壳，等旧包自己挂载
   */
  shell?: string;
  /** 旧包启动时从页面上读、模板现在已经不输出的数据块：id → 正文，旧皮肤上补成隐藏的 <div> */
  data?: Record<string, string>;
}

export const LEGACY_BASE = "https://static.prts.wiki/widgets/production/";

const snapshot = (file: string) =>
  readFileSync(new URL(file, import.meta.url), "utf8").trim();

export const LEGACY_WIDGETS: Record<string, LegacyWidget> = {
  CharList: {
    revision: 429826,
    assets: {
      scripts: ["polyfills.VYzPU9J6.js", "CharList._UhB_qCb.js"],
      preload: [
        "modulepreload-polyfill.P2Xu9kJm.js",
        "rolldown-runtime.hePW80VL.js",
        "common.BxTOM3Y6.js",
        "vendor.hFdkMSyy.js",
        "naive-ui.BJIIUNOk.js",
        "defineProperty.BbfpZ9Tg.js",
      ],
      css: ["style.BkV-zaRu.css"],
    },
    data: {
      // 筛选项定义：微件:CharList/filter 修订 406889 的快照。干员一览页面上的这块已经由
      // prts-skin-migration 的 charlist_filter_div_apply.py 删掉，没有它旧包启动就抛错
      "filter-filter": JSON.stringify(
        JSON.parse(snapshot("CharList.filter.json")),
      ),
    },
  },
  HrCalculator: {
    revision: 433005,
    assets: {
      scripts: ["polyfills.Coc40IVh.js", "HrCalculator.Bi5TIb90.js"],
      preload: [
        "modulepreload-polyfill.P2Xu9kJm.js",
        "rolldown-runtime.hePW80VL.js",
        "common.DJj2d_cc.js",
        "vendor.LcxvFixm.js",
        "defineProperty.BbfpZ9Tg.js",
      ],
      css: ["style.B-VlHT9M.css"],
    },
    shell: snapshot("HrCalculator.shell.html"),
  },
  // 数据（「敌人一览/数据」那份 JSON）新旧两版取的是同一份，不用补。
  // 旧版的预渲染外壳连同 naive-ui 的内联样式有 120 多 KB，不随模板发给所有人：旧皮肤上清空 #root，等旧包挂载
  EnemiesListV2: {
    revision: 433837,
    assets: {
      scripts: ["polyfills.D2fCD57O.js", "EnemiesListV2.ObDWedKn.js"],
      preload: [
        "modulepreload-polyfill.P2Xu9kJm.js",
        "rolldown-runtime.hePW80VL.js",
        "common.DRw64vPv.js",
        "vendor.CDUGDIF8.js",
        "naive-ui.DhG7CVhK.js",
      ],
      css: ["style.CjOkuTET.css"],
    },
    shell: "",
  },
};

/** prune 要保留的旧产物（文件名；对应的 .map 由调用处一并保留） */
export function legacyFiles(): Set<string> {
  return new Set(
    Object.values(LEGACY_WIDGETS).flatMap(({ assets }) => [
      ...assets.scripts,
      ...assets.preload,
      ...assets.css,
    ]),
  );
}

const ASSET_TAG_RE =
  /\s*(?:<script type="module" crossorigin src="([^"]+)"><\/script>|<link rel="(modulepreload|stylesheet)" crossorigin href="([^"]+)">)/g;

/**
 * 从 Vite 构建出的模板里拿走它注入的资源标签。
 * 返回去掉标签后的模板、第一个标签原来的位置和标签里的地址；认不出的 <script> / <link> 直接报错，
 * 免得 Vite 换了写法之后漏掉资源、页面静默白屏。
 */
export function takeAssetTags(html: string): {
  html: string;
  at: number;
  assets: WidgetAssets;
} {
  const assets: WidgetAssets = { scripts: [], preload: [], css: [] };
  let at = -1;
  const rest = html.replace(
    ASSET_TAG_RE,
    (_tag, src: string, rel: string, href: string, offset: number) => {
      if (at < 0) at = offset;
      if (src) assets.scripts.push(src);
      else if (rel === "modulepreload") assets.preload.push(href);
      else assets.css.push(href);
      return "";
    },
  );
  if (at < 0 || assets.scripts.length === 0)
    throw new Error("模板里没有 Vite 注入的入口 <script>");
  if (/<script|<link/.test(rest))
    throw new Error("模板里有认不出的 <script> / <link>，引导脚本会漏掉它");
  return { html: rest, at, assets };
}

/**
 * 页面解析到这里时同步执行：按皮肤挑一组资源插到自己前面（与原来那些标签同一位置，层叠次序不变）。
 * 两条 <script type="module"> 合成一段内联模块里的两句 import，并行下载、按先后执行。
 * 外壳替换在首次绘制之前完成，旧皮肤上不会先闪一下新版的外壳。
 */
const BOOTSTRAP = `(function (anchor, sets) {
  var set = document.body.classList.contains("skin-arknights") ? sets.current : sets.legacy;
  function put(tag, attrs, text) {
    var el = document.createElement(tag);
    for (var name in attrs) el.setAttribute(name, attrs[name]);
    if (text) el.textContent = text;
    anchor.before(el);
  }
  if (set.shell != null) document.getElementById("root").innerHTML = set.shell;
  for (var id in set.data) put("div", { id: id, style: "display:none" }, set.data[id]);
  set.css.forEach(function (href) { put("link", { rel: "stylesheet", crossorigin: "", href: href }); });
  set.preload.forEach(function (href) { put("link", { rel: "modulepreload", crossorigin: "", href: href }); });
  put("script", { type: "module" }, set.scripts.map(function (src) { return "import " + JSON.stringify(src) + ";"; }).join(""));
})(document.currentScript, __SETS__);`;

/** 新版（本次构建）与旧版两组资源的引导脚本 */
export function renderSkinGate(
  current: WidgetAssets,
  { assets, shell, data }: LegacyWidget,
): string {
  const url = (file: string) => LEGACY_BASE + file;
  const sets = {
    current,
    legacy: {
      scripts: assets.scripts.map(url),
      preload: assets.preload.map(url),
      css: assets.css.map(url),
      shell,
      data,
    },
  };
  // 转义 <：外壳和数据里的 </div>、<!--[--> 不能在 <script> 里出现
  const json = JSON.stringify(sets).replaceAll("<", "\\u003c");
  const code = BOOTSTRAP.replace(/\n\s*/g, "").replace("__SETS__", () => json);
  return `<script>${code}</script>`;
}

/** 把模板里的资源标签换成引导脚本 */
export function gateTemplate(html: string, legacy: LegacyWidget): string {
  const { html: rest, at, assets } = takeAssetTags(html);
  return rest.slice(0, at) + renderSkinGate(assets, legacy) + rest.slice(at);
}
