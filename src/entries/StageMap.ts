import { createApp } from "vue";

import { fetchJson, fetchLevel, gamedata } from "../widgets/StageMap/data";
import StageMap from "../widgets/StageMap/index.vue";

import type { EnemyDatabase } from "../widgets/StageMap/enemies";
import type { LevelData } from "../widgets/StageMap/level";

/**
 * 样式来自皮肤：Arknights 皮肤已加载全套，这两个模块是空操作；Vector / Minerva 上
 * 动态加载令牌 + 作用域 + 组件（skins.arknights.components）与官网字体
 * （skins.arknights.fonts：坐标 / 停留秒数用的 Bender），挂载前等它们就位。
 * 走 RLQ 而不是直接调 mw.loader.using 的原因见 VoiceTable.ts。
 */
const STYLE_MODULES = ["skins.arknights.components", "skins.arknights.fonts"];

// 关卡页的普通 / 突袭两段可能各嵌一份；module 脚本只执行一次，所以一次挂上页面里所有的
const roots = document.querySelectorAll<HTMLElement>(".stage-map-root");
if (roots.length > 0) {
  // 敌人名字 / 地位只用在出兵表里，不挡地图：几份共用一次请求，交给组件自己等
  let enemyDb: Promise<EnemyDatabase> | undefined;
  for (const ele of roots) {
    const { levelId = "", stageId = "" } = ele.dataset;
    const level = fetchLevel<LevelData>(levelId);
    enemyDb ??= fetchJson<EnemyDatabase>(
      gamedata("levels/enemydata/enemy_database.json"),
    );
    const db = enemyDb;
    (window.RLQ = window.RLQ || []).push([
      STYLE_MODULES,
      async () => {
        createApp(StageMap, {
          level: await level,
          enemyDb: db,
          stageId,
        }).mount(ele);
      },
    ]);
  }
} else console.error(".stage-map-root not found");
