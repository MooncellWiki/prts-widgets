import 'virtual:uno.css'
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import PenguinWidget from '../widgets/PenguinWidget.vue'

const ele = document.getElementById('penguin-widget')
const type = ele?.dataset.type
const id = ele?.dataset.id
const isAct = !!Number.parseInt(ele?.dataset.isAct || '0')
const language = navigator.language.split('-')[0]

if (ele) {
  fetch('https://static.prts.wiki/20230731ua/display_config_v2.json')
    .then((response) => {
      if (!response.ok)
        throw new Error('[PenguinWidget] Received non-200 response')

      return response.json()
    })
    .then(
      data =>
        !navigator.userAgent.includes(data.userAgent)
        && createApp(PenguinWidget, { type, id, isAct, language })
          .use(createPinia())
          .mount(ele),
    )
    .catch(error => console.error(error))
}
