// 本地静态贴图资源。
//
// 这些是 APK 内置的 UI 贴片（对话框黑条渐变、地区邮戳动画零件）。源仓库
// (arknights-story-player) 把它们放在 public/ui/ 下由 Vite 直接服务到 /ui/；
// 本仓库产物部署到 OSS（base = https://static.prts.wiki/widgets/production），
// 没有 public/ 直出机制，且引擎里写死的 /ui/ 绝对路径在 wiki 页面里会解析
// 错，必须随 widget 打包。
//
// 关键点：必须用 `new URL('./x.png', import.meta.url)` 而非 `import x from
// './x.png'`。本 widget 在 prts.wiki 页面里跨源加载（页面在 prts.wiki，脚本
// 在 dev server / OSS），普通 import 在 dev 下被解析成绝对路径
// `/src/.../*.png`，浏览器按「页面源」解析成 https://prts.wiki/src/... → 404。
// `import.meta.url` 以「当前模块」为基准，dev 下自然指向 dev server；build 下
// Vite 会把它替换成带 hash 的 OSS 资产 URL，小图还会内联成 base64 data URI。
//
// 注意：`new URL` 必须用字符串字面量作为第一参数直接内联，Vite 才能静态分析
// 出资产依赖并打包；不能用函数包装或变量拼接。

/** 对话框顶部/底部黑条渐变纹理 */
export const DIALOG_FRAME_URL = new URL(
  "assets/ui/sprite_avg_cutscene.png",
  import.meta.url,
).href;

/** blocker slider/verticalslider 滑擦蒙版(`slide_left`,avg/[uc]common) */
export const SLIDE_MASK_TEXTURE_URL = new URL(
  "assets/ui/slide_mask.png",
  import.meta.url,
).href;

/** showitem 道具照片的九宫格相框(`sprite_avg_showItem_photo`,120x409、border=32)。
 *  它是 AVG 场景 sharedassets 的内置贴图(挂在 photo slot prefab 的 `background`
 *  子物体上),CDN 热更清单和 PRTS 镜像都不分发,只能随 widget 打包。 */
export const SHOWITEM_PHOTO_FRAME_URL = new URL(
  "assets/ui/sprite_avg_showItem_photo.png",
  import.meta.url,
).href;

/** 地区邮戳（animtext group_location_stamp）各零件贴图 */
export const STAMP_ASSETS = {
  back_gradient: new URL("assets/ui/back_gradient.png", import.meta.url).href,
  back_shadow: new URL("assets/ui/back_shadow.png", import.meta.url).href,
  frame_inner: new URL("assets/ui/frame_inner.png", import.meta.url).href,
  frame_outer: new URL("assets/ui/frame_outer.png", import.meta.url).href,
  icon_back: new URL("assets/ui/icon_back.png", import.meta.url).href,
  icon_comps: new URL("assets/ui/icon_comps.png", import.meta.url).href,
  icon_start: new URL("assets/ui/icon_start.png", import.meta.url).href,
} as const;

/**
 * interlude mask 模板贴图(`avg/[uc]common.ab`,CDN 热更包、不在 APK 基包)。
 * 全部转写自 2.7.81 资源版本 26-10-14 的 bundle 拆包(2026-10-21),prefab
 * 布局与动画关键帧的对照记录见 arknights-rev `docs/commands/avg-interlude-command.md`
 * §8.1;模板层级/动画数值在 `engine/rendering/panels/interludeTemplates.ts`。
 */
export const INTERLUDE_ASSETS = {
  icon_back: new URL("assets/ui/interlude/icon_back.png", import.meta.url).href,
  unknown_vertical: new URL(
    "assets/ui/interlude/img_interlude_unkown_char_vertical.png",
    import.meta.url,
  ).href,
  unknown_square: new URL(
    "assets/ui/interlude/img_interlude_unkown_char_square.png",
    import.meta.url,
  ).href,
  common_frame: new URL(
    "assets/ui/interlude/interclude_common_frame.png",
    import.meta.url,
  ).href,
  wave_base: new URL(
    "assets/ui/interlude/interclude_wave_base.png",
    import.meta.url,
  ).href,
  wave_shadow: new URL("assets/ui/interlude/wave_shadow.png", import.meta.url)
    .href,
  dialog_grad: new URL("assets/ui/interlude/sprite_grad.png", import.meta.url)
    .href,
  dialog_frame: new URL(
    "assets/ui/interlude/dialogue_frame.png",
    import.meta.url,
  ).href,
  gradient_v: new URL("assets/ui/interlude/top_gradient.png", import.meta.url)
    .href,
} as const;
