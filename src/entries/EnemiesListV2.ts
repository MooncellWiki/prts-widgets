import { createApp } from "vue";

import EnemiesListV2 from "../widgets/EnemiesListV2/index.vue";

import type { EnemyData } from "../widgets/EnemiesListV2/enemy";

const ele = document.querySelector("#root");

/** 机器人按游戏数据维护的那份 JSON：每个敌人一条 */
async function fetchSource(): Promise<EnemyData[]> {
  const resp = await fetch(
    `/index.php?${new URLSearchParams({
      title: "敌人一览/数据",
      action: "raw",
      ctype: "application/json",
    })}`,
  );
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const json = await resp.json();
  if (!Array.isArray(json)) throw new Error("「敌人一览/数据」不是数组");
  return json;
}

/**
 * 样式来自皮肤：Arknights 皮肤已加载全套，这两个模块是空操作；Vector / Minerva 上
 * 动态加载令牌 + 作用域 + 组件（skins.arknights.components）与官网字体
 * （skins.arknights.fonts：等级 / 编号用的 Bender），挂载前等它们就位。
 * 数据与样式并行取。走 RLQ 而不是直接调 mw.loader.using 的原因见 VoiceTable.ts。
 */
const STYLE_MODULES = ["skins.arknights.components", "skins.arknights.fonts"];

if (ele) {
  // 取不到数据也照样挂载，结果区换成失败提示——不然预渲染外壳里的 Spinner 会一直转
  const props = fetchSource().then(
    (source) => ({ source }),
    (error) => {
      console.error("[EnemiesListV2] 敌人数据读取失败", error);
      return { failed: true };
    },
  );
  (window.RLQ = window.RLQ || []).push([
    STYLE_MODULES,
    async () => {
      createApp(EnemiesListV2, await props).mount(ele);
    },
  ]);
} else console.error("#root not found");
