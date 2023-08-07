import 'virtual:uno.css'
import { createApp } from 'vue'
import { Spine } from '../utils/spine'
import type { Props } from '../widgets/Spine/Spine.vue'
import SpineVue from '../widgets/Spine/Wrapper.vue'

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error
window.SpineApi = Spine
window.dispatchEvent(new Event('spine_api_ready'))

const spineData: Props = JSON.parse(
  document.getElementById('SPINEDATA')!.innerHTML,
)
spineData.prefix = spineData.prefix.replace(
  'https://static.prts.wiki/spine/',
  'https://static.prts.wiki/spine38/',
)

const ele = document.getElementById('spine-root')
if (ele && spineData)
  createApp(SpineVue, { ...spineData }).mount(ele)
else
  console.error('SPINEDATA or ele not found', ele)
