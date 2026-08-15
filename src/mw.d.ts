declare interface Window {
  RLQ?: any[];
  Sentry?: {
    captureException?: (error: unknown) => string;
    showFeedback?: (
      tags?: Record<string, boolean | number | string>,
    ) => Promise<void>;
    showReportDialog?: (...args: any[]) => void;
  };
  // 旧版剧情播放器 gadget（#sys_fullscreen）暴露的全局对象
  data?: { init?: () => void };
  system?: { disabled?: { init?: () => void } };
  mw: any;
}
