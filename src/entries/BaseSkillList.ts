import { createApp } from "vue";

import { createStores, pagePinia, prefetch } from "../utils/pinia";
import { baseSkillSourceQuery } from "../widgets/BaseSkillList/data";
import BaseSkillList from "../widgets/BaseSkillList/index.vue";

/**
 * 后勤技能一览：{{#widget:BaseSkillList}} 是整张一览（后勤技能一览页面），
 * {{#widget:BaseSkillList|room=制造站}} 是设施页（罗德岛基建/制造站 …）里嵌着的那份，只看这个设施。
 * 容器不叫 #root：设施页上可能还有别的小部件。data-room 写在外面一层：Smarty 注释里的 > 会让
 * scripts/prerender.ts 认不出挂载容器，外壳就塞不进去了。
 *
 * 样式来自皮肤：Arknights 皮肤已加载全套，这两个模块是空操作；Vector / Minerva 上
 * 动态加载令牌 + 作用域 + 组件（skins.arknights.components）与官网字体
 * （skins.arknights.fonts：条数 / 效率用的 Bender），挂载前等它们就位。
 * 数据与样式并行取：挂载前先 prefetch，组件里的 useQuery 接上同一个请求，读取中 / 失败 / 重试都在组件里。
 * 走 RLQ 而不是直接调 mw.loader.using 的原因见 VoiceTable.ts。
 */
const STYLE_MODULES = ["skins.arknights.components", "skins.arknights.fonts"];

const mounts = document.querySelectorAll<HTMLElement>(".base-skill-list");

if (mounts.length > 0) {
  // 一页几份共用整页的 pinia：数据只取一次
  const pinia = pagePinia();
  const apps = [...mounts].map((el) => ({
    el,
    app: createApp(BaseSkillList, { room: el.dataset.room }).use(
      createStores({ pinia }),
    ),
  }));
  prefetch(pinia, baseSkillSourceQuery);
  (window.RLQ = window.RLQ || []).push([
    STYLE_MODULES,
    () => {
      for (const { el, app } of apps) app.mount(el.firstElementChild ?? el);
    },
  ]);
} else console.error(".base-skill-list not found");
