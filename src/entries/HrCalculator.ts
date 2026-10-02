import { createApp } from "vue";

import HrCalculator from "../widgets/HrCalculator/index.vue";

import type { Source } from "../widgets/HrCalculator/recruit";

const ele = document.querySelector("#root");

/** 可公开招募的干员：职业 / 位置 / 稀有度 / 词缀 / 名称 / 获得方式 */
async function fetchSource(): Promise<Source[]> {
  const resp = await fetch(
    `/api.php?${new URLSearchParams({
      action: "cargoquery",
      format: "json",
      tables: "chara,char_obtain",
      limit: "5000",
      fields:
        "chara.profession,chara.position,chara.rarity,chara.tag,chara.cn,char_obtain.obtainMethod",
      where: 'char_obtain.obtainMethod like "%公开招募%" AND chara.charIndex>0',
      join_on: "chara._pageName=char_obtain._pageName",
    })}`,
  );
  const json = await resp.json();
  return json.cargoquery.map(({ title: v }: { title: Record<string, any> }) =>
    Object.freeze({
      profession: v.profession,
      position: v.position,
      rarity: Number.parseInt(v.rarity),
      tag: v.tag?.split(" ") || [],
      zh: v.cn,
      obtainMethod: v.obtainMethod?.split(" ") || [],
    }),
  );
}

/**
 * 样式来自皮肤：Arknights 皮肤已加载全套，这两个模块是空操作；Vector / Minerva 上
 * 动态加载令牌 + 作用域 + 组件（skins.arknights.components）与官网字体
 * （skins.arknights.fonts：时限 / 星级 / 计数用的 Bender），挂载前等它们就位。
 * 数据与样式并行取。走 RLQ 而不是直接调 mw.loader.using 的原因见 VoiceTable.ts。
 */
const STYLE_MODULES = ["skins.arknights.components", "skins.arknights.fonts"];

if (ele) {
  const source = fetchSource();
  (window.RLQ = window.RLQ || []).push([
    STYLE_MODULES,
    async () => {
      createApp(HrCalculator, { source: await source }).mount(ele);
    },
  ]);
} else console.error("#root not found");
