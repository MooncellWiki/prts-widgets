import { createApp } from 'vue';
import 'virtual:windi.css';
// import F:\git\prts-widgets\src\entries\ISEvent.ts from '../widgets/F:\git\prts-widgets\src\entries\ISEvent.ts.vue';
import ISEventFramework from '../widgets/ISEvents/ISEventFramework.vue';

//数据表元素（根层级）
const eventDataRoot = document.getElementById('IS-event-data-root');
//事件场景表元素组
const eventEles = eventDataRoot?.getElementsByClassName(
    'IS-event-data',
) as HTMLCollectionOf<HTMLElement>;

const ISTheme = eventDataRoot?.dataset?.theme;
// debugger;
Array.from(eventEles).forEach((eventEle) => {
    const scenes = (Array.from(eventEle.children) as HTMLElement[]).map(
        (scene) => {
            const data = scene.dataset!;
            return {
                etype: data.etype,
                name: data.name,
                nav: data.nav,
                index: data.index,
                image: data.image,
                text: scene.firstElementChild?.innerHTML,
                options: Array.from(scene.getElementsByClassName('choose')).map(
                    (choose, index) => {
                        const chooseData = choose.dataset!;
                        return {
                            title: chooseData.title,
                            type: chooseData.type,
                            icon: chooseData.icon,
                            desc1: choose.getElementsByClassName('desc1')[0]
                                ?.innerHTML,
                            desc2: choose.getElementsByClassName('desc2')[0]
                                ?.innerHTML,
                            dest: chooseData.dest,
                            index,
                        };
                    },
                ),
            };
        },
    );
    createApp(ISEventFramework, {
        sceneData: scenes,
        ISTheme: ISTheme,
    }).mount(eventEle);
});
