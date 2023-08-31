import defaultStyle from "../widgets/DisplayController.css?inline";

interface DisplayConfig {
  userAgent: string;
  styleClass: string;
  selectors: string[];
  redirectBodyClasses: string[];
}

const defaultDisplayConfig: DisplayConfig = {
  userAgent: "SKLand",
  styleClass: "skland-hidden",
  selectors: [
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
    return document.querySelector(selector)?.remove();
  } catch (e) {
    console.log(
      `[DisplayController] An error occurred while removing ${selector}`,
      e,
    );
  }
}

function main(config: DisplayConfig) {
  const styleEle = document.createElement("style");
  styleEle.className = config.styleClass;
  styleEle.innerHTML = defaultStyle;
  document.head.appendChild(styleEle);

  if (navigator.userAgent.includes(config.userAgent)) {
    if (window.location.hostname === "prts.wiki") {
      window.location.replace(
        window.location.href.replace("prts.wiki", "m.prts.wiki"),
      );
    }

    config.redirectBodyClasses.forEach((page) => {
      if (document.body.classList.contains(page))
        window.location.replace("https://m.prts.wiki");
    });

    config.selectors.forEach((selector) => {
      removeDOM(selector);
    });

    const createViewport = () => {
      const viewport = document.createElement("meta");
      viewport.setAttribute("name", "viewport");
      document.head.appendChild(viewport);
      return viewport;
    };
    const viewport =
      document.querySelector("meta[name='viewport']") || createViewport();

    const viewportContent =
      viewport.getAttribute("content") ||
      "initial-scale=1.0, user-scalable=no, minimum-scale=0.25, maximum-scale=5.0, width=device-width";

    viewport.setAttribute(
      "content",
      viewportContent.replaceAll("user-scalable=yes", "user-scalable=no"),
    );
  } else {
    removeDOM(`.${config.styleClass}`);
  }
}

main(defaultDisplayConfig);

fetch("https://static.prts.wiki/20230731ua/display_config_v2.json")
  .then((response) => {
    if (!response.ok)
      throw new Error("[DisplayController] Received non-200 response");

    return response.json();
  })
  .then((data) => main(data))
  .catch((error) => console.error(error));
