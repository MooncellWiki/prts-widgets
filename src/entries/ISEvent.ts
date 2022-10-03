import { createApp } from 'vue';
import 'virtual:windi.css';
// import F:\git\prts-widgets\src\entries\ISEvent.ts from '../widgets/F:\git\prts-widgets\src\entries\ISEvent.ts.vue';
import ISEventFramework from '../widgets/ISEvents/ISEventFramework.vue'

//网页显示用元素
const ele = document.getElementById('IS-event-block-root');
//数据表元素（根层级）
const eventDataRoot = document.getElementById('IS-event-data-root');
//事件场景表元素组
const evnetEle = eventDataRoot?.getElementsByClassName(
    'IS-event-data',
) as HTMLCollectionOf<HTMLElement>;

if (ele?.dataset?.item) {
    createApp(ISEventFramework).mount(ele);
} else {
    console.error('data-item or ele not found', ele);
}
  