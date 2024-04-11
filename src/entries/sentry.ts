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

  ignoreErrors: [
    // ads and statistics
    "google",
    "baidu",
    // START: https://docs.sentry.io/platforms/javascript/configuration/filtering/#decluttering-sentry
    // Random plugins/extensions
    "top.GLOBALS",
    // See: http://blog.errorception.com/2012/03/tale-of-unfindable-js-error.html
    "originalCreateNotification",
    "canvas.contentDocument",
    "MyApp_RemoveAllHighlights",
    "http://tt.epicplay.com",
    "Can't find variable: ZiteReader",
    "jigsaw is not defined",
    "ComboSearch is not defined",
    "http://loading.retry.widdit.com/",
    "atomicFindClose",
    // Facebook borked
    "fb_xd_fragment",
    // ISP "optimizing" proxy - `Cache-Control: no-transform` seems to
    // reduce this. (thanks @acdha)
    // See http://stackoverflow.com/questions/4113268
    "bmi_SafeAddOnload",
    "EBCallBackMessageReceived",
    // See http://toolbar.conduit.com/Developer/HtmlAndGadget/Methods/JSInjection.aspx
    "conduitPage",
  ],
  denyUrls: [
    // Facebook flakiness
    /graph\.facebook\.com/i,
    // Facebook blocked
    /connect\.facebook\.net\/en_us\/all\.js/i,
    // Woopra flakiness
    /eatdifferent\.com\.woopra-ns\.com/i,
    /static\.woopra\.com\/js\/woopra\.js/i,
    // Chrome extensions
    /extensions\//i,
    /^chrome:\/\//i,
    /^chrome-extension:\/\//i,
    // Other plugins
    /127\.0\.0\.1:4001\/isrunning/i, // Cacaoweb
    /webappstoolbarba\.texthelp\.com\//i,
    /metrics\.itunes\.apple\.com\.edgesuite\.net\//i,
  ],
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
