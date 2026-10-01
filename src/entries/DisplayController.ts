import defaultStyle from "@/styles/display-controller.css?inline";

interface DisplayConfig {
  userAgent: string;
  hiddenClass: string;
  selectors: string[];
  redirectBodyClasses: string[];
}

const STYLE_ELEMENT_CLASS = "skland-style";

const defaultDisplayConfig: DisplayConfig = {
  userAgent: "SKLand",
  hiddenClass: "skland-hidden",
  selectors: [
    // Vector / Minerva
    "#p-personal",
    "#pt-preferences",
    "#p-prts-extra-links",
    ".mp-support-us",
    ".mp-more-info",
    ".footer-places",
    ".page-actions-menu",
    ".penguin-widget",
    "#ooui-penguin-mirror-option-container",
    "#ooui-penguin-server-option-container",
    "#ooui-penguin-stage-option-container",
    ".minerva-user-notifications",
    ".minerva-user-menu",
    'a[data-event-name="tabs.talk"]',
    ".last-modified-bar",
    ".flow-board-page",
    // Arknights
    "#ak-user-menu",
    "#p-notifications",
    "#ak-page-tools",
    "#footer-info-lastmod",
    ".ak-footer__col",
    // :has() 只放在这里，别加进 display-controller.css：不支持的 WebView 会让整条规则失效
    '#MenuSidebar li:has(a[title^="PRTS:如何帮助我们完善网站"])',
    '#MenuSidebar li:has(a[title="PRTS:反馈与建议"])',
  ],
  redirectBodyClasses: [
    "page-特殊_创建账户",
    "page-特殊_用户登录",
    "page-PRTS_如何帮助我们完善网站",
    "page-PRTS_交流群组",
    "page-PRTS_收支一览",
    "page-PRTS_反馈与建议",
    "ns-2",
    "ns-talk",
  ],
};
// ns-2 -> ns-userpages

function removeDOM(selector: string) {
  try {
    document.querySelectorAll(selector).forEach((element) => element.remove());
  } catch (error) {
    console.log(
      `[DisplayController] An error occurred while removing ${selector}`,
      error,
    );
  }
}
function createViewport() {
  const viewport = document.createElement("meta");
  viewport.setAttribute("name", "viewport");
  document.head.append(viewport);

  return viewport;
}

function main(config: DisplayConfig) {
  const styleEle = document.createElement("style");
  styleEle.className = STYLE_ELEMENT_CLASS;
  styleEle.innerHTML = defaultStyle;
  document.head.append(styleEle);

  if (navigator.userAgent.includes(config.userAgent)) {
    // Arknights 皮肤不分移动域名，m. 退役后会 301 回主域，再往 m. 跳就是死循环
    const toMobileDomain =
      window.location.hostname === "prts.wiki" &&
      !document.body.classList.contains("skin-arknights");
    if (toMobileDomain) {
      window.location.replace(
        window.location.href.replace("prts.wiki", "m.prts.wiki"),
      );
    }

    for (const page of config.redirectBodyClasses) {
      if (document.body.classList.contains(page))
        window.location.replace(
          toMobileDomain ? "https://m.prts.wiki" : window.location.origin,
        );
    }

    for (const selector of config.selectors) {
      removeDOM(selector);
    }
    removeDOM(`.${config.hiddenClass}`);

    const viewport =
      document.querySelector("meta[name='viewport']") || createViewport();
    const viewportContent =
      viewport.getAttribute("content") ||
      "initial-scale=1.0, user-scalable=no, minimum-scale=0.25, maximum-scale=5.0, width=device-width";
    viewport.setAttribute(
      "content",
      // Arknights 的 viewport 不带 user-scalable，要补上
      viewportContent.includes("user-scalable=")
        ? viewportContent.replace(/user-scalable=yes/g, "user-scalable=no")
        : `${viewportContent}, user-scalable=no`,
    );
  } else removeDOM(`.${STYLE_ELEMENT_CLASS}`);
}

main(defaultDisplayConfig);

fetch("https://static.prts.wiki/skland/display_config_v3.json")
  .then((response) => {
    if (!response.ok)
      throw new Error("[DisplayController] Received non-200 response");

    return response.json();
  })
  .then((data) => main(data))
  .catch((error) => console.error(error));
