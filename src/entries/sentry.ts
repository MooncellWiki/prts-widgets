import * as Sentry from "@sentry/browser";

const PRTS_DSN =
  "https://73af36ee35564fe4946285b451a8405a@ingest.sentry.mooncell.wiki/4507366072188928";
const FGO_DSN =
  "https://01082a530240c908ac0d34ffe79729a2@ingest.sentry.mooncell.wiki/4507366079070208";

// 显式白名单，不用 host.includes 猜。未知 host（例如 mooncell.wiki 沙箱站）
// 拿不到 DSN，Sentry 会以禁用状态启动，不会把数据悄悄记到别的项目名下。
const DSN_BY_HOST: Record<string, string> = {
  "prts.wiki": PRTS_DSN,
  "m.prts.wiki": PRTS_DSN,
  "fgo.wiki": FGO_DSN,
  "m.fgo.wiki": FGO_DSN,
};

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
  dsn: DSN_BY_HOST[location.host],
  integrations: [
    Sentry.breadcrumbsIntegration({
      console: false,
    }),
    Sentry.contextLinesIntegration(),
    // MediaWiki 是 MPA，真实跳转都是整页加载（记为 pageload）。history change 来自
    // 核心/皮肤/其他 gadget 的 pushState（搜索浮层之类），量测的是 UI 状态变化而非
    // 页面加载，会以「极快的导航」混进 p75 把数据拉偏，占计费量还有 26~29%。
    Sentry.browserTracingIntegration({ instrumentNavigation: false }),
    Sentry.httpClientIntegration(),
    feedback,
  ],

  // errors 配额 500 万/月，此前 1% 采样只用掉约 10%。提到 5% 后约 12%，仍有余量。
  sampleRate: 0.05,

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
  // 两站合计约 2450 万 PV/月（对齐百度统计）。0.02 在峰值月约 95 万条、平峰月约
  // 52 万条，占 1000 万 transactions 配额的 5~10%（含后端 11~18%）。样本量算
  // p75 Web Vitals 绰绰有余；再往上主要是压自家 ingest 带宽——一条 pageload
  // transaction 实测平均带约 70 个 span。
  tracesSampleRate: 0.02,
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
