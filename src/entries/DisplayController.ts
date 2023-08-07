import defaultStyle from '../widgets/DisplayController.css?inline'

interface DisplayConfig {
  version: number
  userAgent: string
  styleClass: string
  selectors: string[]
  redirectSelectors: string[]
}

const defaultDisplayConfig: DisplayConfig = {
  version: 0,
  userAgent: 'SKLand',
  styleClass: 'skland-hidden',
  selectors: [
    '#p-personal',
    '#pt-preferences',
    '#p-prts-extra-links',
    '.mp-support-us',
    '.mp-more-info',
    '.footer-places',
    '.page-actions-menu',
    '.penguin-widget',
    '#ooui-penguin-mirror-option-container',
    '#ooui-penguin-server-option-container',
    '#ooui-penguin-stage-option-container',
    '.minerva-user-notifications',
    '.minerva-user-menu',
    'a[data-event-name="tabs.talk"]',
    '.last-modified-bar',
  ],
  redirectSelectors: [
    'page-特殊_创建账户',
    'page-特殊_用户登录',
    'page-PRTS_如何帮助我们完善网站',
    'page-PRTS_交流群组',
    'page-PRTS_收支一览',
    'page-PRTS_反馈与建议',
    'ns-2',
  ],
}
// ns-2 -> ns-userpages

function removeDOM(selector: string) {
  try {
    return document.querySelector(selector)?.remove()
  }
  catch (e) {
    console.log('[DisplayController] An error occurred while removing', e)
  }
}

function main(config: DisplayConfig) {
  const styleEle = document.createElement('style')
  styleEle.className = config.styleClass
  styleEle.innerHTML = defaultStyle
  document.head.appendChild(styleEle)

  if (navigator.userAgent.includes(config.userAgent)) {
    if (window.location.hostname === 'prts.wiki') {
      window.location.replace(
        window.location.href.replace('prts.wiki', 'm.prts.wiki'),
      )
    }
    config.redirectSelectors.forEach((page) => {
      if (document.body.classList.contains(page))
        window.location.replace('https://m.prts.wiki')
    })
    config.selectors.forEach((selector) => {
      removeDOM(selector)
    })
    const viewport = document.querySelector('meta[name=\'viewport\']')
    const viewportContent = viewport?.getAttribute('content')

    viewport?.setAttribute(
      'content',
      viewportContent
        ? viewportContent.replaceAll('user-scalable=yes', 'user-scalable=no')
        : 'initial-scale=1.0, user-scalable=no, minimum-scale=0.25, maximum-scale=5.0, width=device-width',
    )
  }
  else {
    removeDOM(`.${config.styleClass}`)
  }
}

main(defaultDisplayConfig)

fetch('https://static.prts.wiki/20230731ua/display_config.json')
  .then((response) => {
    if (!response.ok)
      throw new Error('[DisplayController] Received non-200 response')

    return response.json()
  })
  .then(data => main(data))
  .catch(error => console.error(error))
