import { createApp } from 'vue';
import 'virtual:windi.css';
import F:\git\prts-widgets\src\entries\ISEvent.ts from '../widgets/F:\git\prts-widgets\src\entries\ISEvent.ts.vue';

const ele = document.getElementById('root');
if (ele?.dataset?.item) {
    createApp(F:\git\prts-widgets\src\entries\ISEvent.ts, { item: ele.dataset.item }).mount(ele);
} else {
    console.error('data-item or ele not found', ele);
}
  