import { createApp } from 'vue';
import 'virtual:uno.css';
import ArkSign from '../widgets/ArkSign/outer.vue';

const ele = document.querySelector("#root");
if (ele) createApp(ArkSign, {}).mount(ele);
  