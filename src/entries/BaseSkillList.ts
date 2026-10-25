import { createApp } from "vue";

import { fetchSource } from "../widgets/BaseSkillList/data";
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
 * 数据与样式并行取。走 RLQ 而不是直接调 mw.loader.using 的原因见 VoiceTable.ts。
 */
const STYLE_MODULES = ["skins.arknights.components", "skins.arknights.fonts"];

const mounts = document.querySelectorAll<HTMLElement>(".base-skill-list");

if (mounts.length > 0) {
  // 一页几份共用一次取数；取不到也照样挂载，结果区换成失败提示——不然预渲染外壳里的 Spinner 会一直转
  const source = fetchSource().then(
    (source) => ({ source }),
    (error) => {
      console.error("[BaseSkillList] 后勤技能数据读取失败", error);
      return { failed: true };
    },
  );
  (window.RLQ = window.RLQ || []).push([
    STYLE_MODULES,
    async () => {
      const props = await source;
      for (const el of mounts)
        createApp(BaseSkillList, { ...props, room: el.dataset.room }).mount(
          el.firstElementChild ?? el,
        );
    },
  ]);
} else console.error(".base-skill-list not found");
