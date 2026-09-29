/**
 * Asset provenance: the AVG Text components -- `panel_dialog` text_name /
 * text_message, the `panel_decision` options, `panel_subtitle` and the
 * `sticker_text` / `timer_sticker_text` prefabs -- serialize the Unity Font
 * asset `NotoSansHans-Medium` (Noto Sans S Chinese Medium, weight 500,
 * FontStyle Normal). Their `LocalizeTextUIConfig` only destroys itself on
 * Start and no `DynFontLoader` sits on them, so nothing swaps the font at
 * runtime. The file served here is that asset's `m_FontData`, as WOFF2.
 *
 * This module is a web adaptation: it explicitly registers the exported font
 * with the browser before PIXI measures dialogue text. Native loading uses a
 * Unity Font asset and ResourceManager instead.
 *
 */
// 对话 UI 字体的显式预加载。
// 为什么不用纯 CSS @font-face：浏览器对 @font-face 是惰性加载，
// 只有当文档里实际出现用该 family 名的 DOM 文本时才会发起请求。
// 我们的对话文本是 PIXI 在 canvas 里用 ctx.font 渲染的，
// 浏览器不一定认为"文档使用了该字体"，导致 F12 Network 看不到请求、
// 字体永远不会下载。
// 用 FontFace API 显式 fetch + register + load，可保证资源被请求，
// 且返回的 Promise resolve 后 measureText 测量的是真实字体 metrics
// （BestFit / 动态 Y 调整依赖准确测量）。
// DIALOG_FONT_FAMILY 是 PIXI 内部使用的逻辑名（仅出现在各面板 TextStyle 的
// fontFamily 里，无 CSS/DOM 引用）。加载的就是客户端的 NotoSansHans-Medium，
// 只注册 500 这一个字重：TextStyle 要用 DIALOG_FONT_WEIGHT，写 bold 会让浏览器
// 合成伪粗体。

export const DIALOG_FONT_FAMILY = "NotoSansHans-Medium";
export const DIALOG_FONT_WEIGHT = "500";
// FontFace API 以 CORS 模式取字体；static.prts.wiki 的 OSS 桶有 Referer 防盗链
// 且 403 时不带 CORS 头，产物与其同源时没问题，localhost 直连会被拦。dev 下改
// 走 vite 代理（见 vite.config.ts 的 /debug-static），生产保持直连。
//
// 必须按 import.meta.url（= dev server 源）解析而不是写相对路径：微件:StoryPlayer/dev
// 那条链路的文档源是 prts.wiki，只有模块从 localhost:8080 加载，相对路径会打到
// prts.wiki/debug-static 上 404。与 assets.ts 的 `new URL(..., import.meta.url)` 同因。
// 代理响应带 vite 的 CORS 头（server.cors.origin 放行了 prts.wiki），跨源取得到。
// 路径必须经变量传入：`new URL("字面量", import.meta.url)` 会被 vite 当成静态
// 资源改写成 /@fs/debug-static/…，请求到不了代理。
const DEV_FONT_PATH = "/debug-static/NotoSansHans-Medium.woff2";
export const DIALOG_FONT_URL = import.meta.env.DEV
  ? new URL(DEV_FONT_PATH, import.meta.url).href
  : "https://static.prts.wiki/NotoSansHans-Medium.woff2";

let loadPromise: Promise<void> | null = null;

export function preloadDialogFont(): Promise<void> {
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    // 环境无 FontFace（如 jsdom）直接跳过，不阻塞启动。
    if (typeof FontFace === "undefined") return;

    try {
      const face = new FontFace(DIALOG_FONT_FAMILY, `url(${DIALOG_FONT_URL})`, {
        style: "normal",
        weight: DIALOG_FONT_WEIGHT,
        display: "swap",
      });
      await face.load();
      document.fonts.add(face);
    } catch (error) {
      // 字体加载失败不应阻塞剧情播放，降级到回退字体。
      console.warn("[story] dialog font load failed, falling back:", error);
    }
  })();

  return loadPromise;
}
