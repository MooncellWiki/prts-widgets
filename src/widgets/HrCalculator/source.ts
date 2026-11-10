import { defineQueryOptions } from "@pinia/colada";

import type { Source } from "./recruit";

/** 可公开招募的干员：职业 / 位置 / 稀有度 / 词缀 / 名称 / 游戏内 ID / 获得方式；API 报错（返回里没有 cargoquery）当失败 */
async function fetchSource(): Promise<Source[]> {
  const resp = await fetch(
    `/api.php?${new URLSearchParams({
      action: "cargoquery",
      format: "json",
      tables: "chara,char_obtain",
      limit: "5000",
      fields:
        "chara.profession,chara.position,chara.rarity,chara.tag,chara.cn,chara.charId,char_obtain.obtainMethod",
      where: 'char_obtain.obtainMethod like "%公开招募%" AND chara.charIndex>0',
      join_on: "chara._pageName=char_obtain._pageName",
    })}`,
  );
  const json = await resp.json();
  if (!json.cargoquery)
    throw new Error(json.error?.info ?? "cargoquery 没有返回数据");
  return json.cargoquery.map(({ title: v }: { title: Record<string, any> }) =>
    Object.freeze({
      profession: v.profession,
      position: v.position,
      rarity: Number.parseInt(v.rarity),
      tag: v.tag?.split(" ") || [],
      zh: v.cn,
      charId: v.charId || "",
      obtainMethod: v.obtainMethod?.split(" ") || [],
    }),
  );
}

/** 公招干员。入口挂载前就先发出去（prefetch），和皮肤样式一起取；根组件建状态、结果区显示读取中 / 失败都用它 */
export const recruitSourceQuery = defineQueryOptions({
  key: ["hr-calculator", "source"],
  query: () =>
    fetchSource().catch((error: unknown) => {
      console.error("[HrCalculator] 干员数据读取失败", error);
      throw error;
    }),
});
