import * as Sentry from "@sentry/browser";
import {
  httpClientIntegration,
  contextLinesIntegration,
} from "@sentry/integrations";
Sentry.init({
  dsn: location.host.includes("prts")
    ? "https://dc4bd835a0a1de41d7107d3eb1dbf4e1@ingest.sentry.mooncell.wiki/5"
    : "https://e95fe8bc65f2c314caeb986d048bed5c@ingest.sentry.mooncell.wiki/6",
  integrations: [
    Sentry.breadcrumbsIntegration({
      console: false,
    }),
    Sentry.browserTracingIntegration(),
    httpClientIntegration(),
    contextLinesIntegration(),
  ],

  sampleRate: 0.01,

  ignoreErrors: ["google", "baidu"],

  // pref
  tracesSampleRate: 0.0001,
  // Set `tracePropagationTargets` to control for which URLs distributed tracing should be enabled
  tracePropagationTargets: [/^https:\/\/(m\.)?((prts)|(fgo))\.wiki\/.*\.php/],
});

window.Sentry = {
  showReportDialog: Sentry.showReportDialog,
  captureException: Sentry.captureException,
};
(window.RLQ = window.RLQ || []).push([
  "mediawiki.user",
  function () {
    if (window.mw.user.isAnon()) {
      return;
    }
    Sentry.setUser({
      id: window.mw.user.getId(),
      username: window.mw.user.getName(),
    });
  },
]);
