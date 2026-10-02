/** 查看器自己的线稿图标（24×24，描边 = currentColor，粗细由 .sv 的样式给）；设计系统的 icons 里没有逐帧 / 翻转 / 放大这几枚 */
export const ICONS = {
  play: '<path stroke-linejoin="round" d="M7 4v16l12-8z"/>',
  pause: '<path d="M6 4h4v16H6zm8 0h4v16h-4z"/>',
  prev: '<path stroke-linejoin="round" d="M19 5v14l-10-7zM6 5v14"/>',
  next: '<path stroke-linejoin="round" d="M5 5v14l10-7zM18 5v14"/>',
  flip: '<path d="M12 3v18M8 7l-5 5 5 5zM16 7l5 5-5 5z"/>',
  reset: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5M12 9v6M9 12h6"/>',
  max: '<path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7"/>',
  min: '<path d="M20 10h-6V4M4 14h6v6M14 10l6-6M10 14l-6 6"/>',
  download: '<path d="M12 4v12m-5-5 5 5 5-5M4 20h16"/>',
} as const;

export type SvIconName = keyof typeof ICONS;
