import { createApp } from 'vue';
import 'virtual:windi.css';
// import F:\git\prts-widgets\src\entries\ISEvent.ts from '../widgets/F:\git\prts-widgets\src\entries\ISEvent.ts.vue';
import ISEventFramework from '../widgets/ISEvents/ISEventFramework.vue'

//网页显示用元素
const ele = document.getElementById('IS-event-block-root');
//数据表元素（根层级）
const eventDataRoot = document.getElementById('IS-event-data-root');
//事件场景表元素组
const eventEles = eventDataRoot?.getElementsByClassName(
    'IS-event-data',
) as HTMLCollectionOf<HTMLElement>;

Array.from(eventEles).forEach((eventEle) => {
    const scenes = Array.from(eventEle.children).map((scene) => {
        const data = scene.dataset!;
        return {
            name: data.name,
            nav: data.nav,
            index: data.index,
            image: data.image,
            text: data.text,
            options: Array.from(scene.children).map((choose) => {
                const chooseData = choose.dataset!;
                return {
                    title: chooseData.title,
                    type: chooseData.type,
                    icon: chooseData.icon,
                    description: chooseData.desc,
                    dest: chooseData.dest
                }
            }),
        };
    });
    createApp(ISEventFramework, {
        sceneData: scenes
    }).mount(eventEle)
});