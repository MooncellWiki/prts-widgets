declare interface Window {
  RLQ?: any[];
  Sentry?: {
    captureException?: (error: unknown) => string;
    showFeedback?: (
      tags?: Record<string, boolean | number | string>,
    ) => Promise<void>;
    showReportDialog?: (...args: any[]) => void;
  };
  mw: any;
}
