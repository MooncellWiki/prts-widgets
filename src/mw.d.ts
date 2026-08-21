declare interface Window {
  RLQ?: any[];
  Sentry?: {
    captureException?: (error: unknown) => string;
    showFeedback?: (
      tags?: Record<string, boolean | number | string>,
    ) => Promise<void>;
    showReportDialog?: (...args: any[]) => void;
  };
  // src/entries/Tooltip.ts 注入的全站 tippy，命名空间是 tippy6，
  // 避开 SMW 自带的 window.tippy
  tippy6?: typeof import("tippy.js").default;
  // 旧版剧情播放器 gadget（#sys_fullscreen）暴露的全局对象
  data?: { init?: () => void };
  system?: { disabled?: { init?: () => void } };
  mw: any;
}
