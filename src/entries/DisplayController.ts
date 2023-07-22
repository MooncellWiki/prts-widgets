enum FilterFieldType {
  USER_AGENT,
}

enum FilterCondType {
  INCLUDES,
}

interface DisplayConfig {
  version: number
  userAgent: string
  styleClass: string
  selectors: string[]
  pages: string[]
}

const defaultDisplayConfig: DisplayConfig = {
  version: 0,
  userAgent: '20230731UA',
  styleClass: '.20230731UA-hidden',
  selectors: [
    '#p-personal',
    '#pt-preferences',
    '#p-prts-extra-links',
    '.mp-siteinfo',
    '#footer-places-desktop-toggle',
    '.page-actions-menu',
    '.penguin-widget',
    '#ooui-penguin-mirror-option-container',
    '#ooui-penguin-server-option-container',
    '#ooui-penguin-stage-option-container',
  ],
  pages: [
    '特殊:创建账户',
    '特殊:用户登录',
    'PRTS:如何帮助我们完善网站#资助我们改善访问质量',
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
  if (navigator.userAgent.includes(config.userAgent)) {
    config.pages.forEach((page) => {
      if (document.title.includes(page))
        window.location.replace('https://m.prts.wiki')
    })
    config.selectors.forEach((selector) => {
      removeDOM(selector)
    })
  }
  else {
    removeDOM(config.styleClass)
  }
}

fetch('https://static.prts.wiki/display_config.json')
  .then((response) => {
    if (!response.ok)
      main(defaultDisplayConfig)

    return response.json()
  })
  .then((data) => {
    main(data)
  })
  .catch((error) => {
    console.log('[DisplayController] Falling back to default config', error)
    main(defaultDisplayConfig)
  })
