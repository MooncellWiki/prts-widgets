import * as Sentry from "@sentry/browser";

const feedback = Sentry.feedbackIntegration({
  autoInject: false,
  colorScheme: "system",
  enableScreenshot: false,

  // 中文文案
  triggerLabel: "问题反馈",
  triggerAriaLabel: "问题反馈",
  formTitle: "问题反馈",
  submitButtonLabel: "提交反馈",
  cancelButtonLabel: "取消",
  confirmButtonLabel: "确认",
  isRequiredLabel: "（必填）",
  nameLabel: "昵称",
  namePlaceholder: "你的昵称",
  emailLabel: "邮箱",
  emailPlaceholder: "you@example.com",
  // 截图上传已关闭，这里引导用户改用公开图床链接
  messageLabel: "问题描述（如需附图，请提供公开图床链接）",
  messagePlaceholder:
    "遇到了什么问题？期望的表现是什么？\n" +
    "如需附上截图，请先上传到公开图床（如 SM.MS、imgur 等），再把图片链接粘贴到这里。",
  successMessageText: "感谢你的反馈！",
  errorEmptyMessageText: "反馈内容不能为空",
  errorNoClientText: "反馈组件未初始化，无法发送反馈。",
  errorTimeoutText: "无法确认反馈是否发送成功。",
  errorForbiddenText: "反馈发送失败，当前域名可能不在允许列表中。",
  errorGenericText: "反馈发送失败，可能是网络问题或浏览器广告拦截插件导致的。",
});

Sentry.init({
  dsn: location.host.includes("prts")
    ? "https://73af36ee35564fe4946285b451a8405a@ingest.sentry.mooncell.wiki/4507366072188928"
    : "https://01082a530240c908ac0d34ffe79729a2@ingest.sentry.mooncell.wiki/4507366079070208",
  integrations: [
    Sentry.breadcrumbsIntegration({
      console: false,
    }),
    Sentry.contextLinesIntegration(),
    Sentry.browserTracingIntegration(),
    Sentry.httpClientIntegration(),
    Sentry.contextLinesIntegration(),
    feedback,
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
  showFeedback: async (tags) => {
    const form = await feedback.createForm({ tags });
    form.appendToDom();
    form.open();
  },
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
