// src/entries/sentry.ts 挂到 window 上的精简 Sentry 门面，
// 签名直接从 @sentry/browser 的类型里取，避免手抄后和 SDK 版本漂移
type SentryBrowser = typeof import("@sentry/browser");
type SentryFeedback = ReturnType<SentryBrowser["feedbackIntegration"]>;
type SentryFeedbackTags = NonNullable<
  Parameters<SentryFeedback["createForm"]>[0]
>["tags"];

declare global {
  interface Window {
    RLQ?: any[];
    Sentry?: {
      captureException?: SentryBrowser["captureException"];
      // showFeedback 是本仓库自己包的，只有 tags 取自 SDK
      showFeedback?: (tags?: SentryFeedbackTags) => Promise<void>;
      showReportDialog?: SentryBrowser["showReportDialog"];
    };
    // src/entries/Tooltip.ts 注入的全站 tippy，命名空间是 tippy6，
    // 避开 SMW 自带的 window.tippy
    tippy6?: typeof import("tippy.js").default;
    // 旧版剧情播放器 gadget（#sys_fullscreen）暴露的全局对象
    data?: { init?: () => void };
    system?: { disabled?: { init?: () => void } };
    // Widget:CharinfoV2 内联的干员信息；VoiceTable 从 cv 里取各语种的配音演员
    char_info?: { cv?: Record<string, { name?: string } | undefined> };
    // src/entries/VoiceTable.ts 挂出的语音数据，给 CharinfoV2 试听用
    charVoice?: unknown[];
    mw: any;
  }
}

export {};
