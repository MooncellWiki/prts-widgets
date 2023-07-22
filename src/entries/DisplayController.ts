import defaultStyle from '../widgets/DisplayController.css?inline'

interface DisplayConfig {
  version: number
  userAgent: string
  styleClass: string
  selectors: string[]
  pages: string[]
}

const defaultDisplayConfig: DisplayConfig = {
  version: 0,
  userAgent: 'ua20230731',
  styleClass: 'ua20230731-hidden',
  selectors: [
    '#p-personal',
    '#pt-preferences',
    '#p-prts-extra-links',
    '.mp-support-us',
    '.mp-more-info',
    '#footer-places-desktop-toggle',
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
  pages: [
    '特殊:创建账户',
    '特殊:用户登录',
    'PRTS:如何帮助我们完善网站',
    'PRTS:交流群组',
    'PRTS:收支一览',
    'PRTS:反馈与建议',
  ],
}

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
    config.pages.forEach((page) => {
      if (document.title.includes(page))
        window.location.replace('https://m.prts.wiki')
    })
    config.selectors.forEach((selector) => {
      removeDOM(selector)
    })
  }
  else {
    removeDOM(`.${config.styleClass}`)
  }
}

fetch('https://static.prts.wiki/20230731ua/display_config.json')
  .then((response) => {
    if (!response.ok)
      throw new Error('[DisplayController] Received non-200 response')

    return response.json()
  })
  .then(data => main(data))
  .catch((error) => {
    console.error(error)
    console.log(
      '[DisplayController] Falling back to default config',
      defaultDisplayConfig,
    )
    main(defaultDisplayConfig)
  })
