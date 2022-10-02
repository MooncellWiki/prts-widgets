import 'virtual:windi.css';
import { createApp } from 'vue';
import Voice from '../widgets/Voice/VoiceTable.vue';
import VoiceMobile from '../widgets/Voice/VoiceTableMobile.vue';

const ele = document.getElementById('voice-table-root');
const dataRoot = document.getElementById('voice-data-root');
const dataEle = dataRoot?.getElementsByClassName(
    'voice-data-item',
) as HTMLCollectionOf<HTMLElement>;

const langSet = new Set<string>();
const voiceBase =
    dataRoot?.dataset?.voiceBase?.split(',').map((kvp) => {
        const [lang, path] = kvp.split(':');
        return {
            lang,
            path,
        };
    }) || [];
const voiceData = Array.from(dataEle).map((ele) => ({
    title: ele?.dataset?.title,
    index: ele?.dataset?.voiceIndex,
    voiceFilename: ele?.dataset?.voiceFilename,
    cond: ele?.dataset?.cond,
    detail: Array.from(ele.children as HTMLCollectionOf<HTMLElement>).reduce<{
        [index: string]: string;
    }>((acc, curr) => {
        if (curr.dataset?.kindName !== void 0) {
            acc[curr.dataset.kindName] = curr.innerHTML;
            langSet.add(curr.dataset.kindName);
        }
        return acc;
    }, {}),
}));
const langArr = Array.from(langSet);
// 挂到window上面给上面的charInfo用
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore;
window.charVoice = voiceData;
console.log(dataRoot, voiceData, voiceBase, langSet);
const isMobile = !!document
    .getElementsByTagName('body')[0]
    .classList.contains('skin-minerva');
if (
    ele &&
    dataRoot?.dataset?.tocTitle &&
    dataRoot?.dataset?.voiceKey &&
    voiceData
) {
    if (isMobile) {
        createApp(VoiceMobile, {
            tocTitle: dataRoot?.dataset?.tocTitle,
            voiceKey: dataRoot?.dataset?.voiceKey,
            voiceData: voiceData,
            langArr: langArr,
            voiceBase: voiceBase,
        }).mount(ele);
    } else {
        createApp(Voice, {
            tocTitle: dataRoot?.dataset?.tocTitle,
            voiceKey: dataRoot?.dataset?.voiceKey,
            voiceData: voiceData,
            langArr: langArr,
            voiceBase: voiceBase,
        }).mount(ele);
    }
} else {
    console.error('voice-data or ele not found', ele);
}
