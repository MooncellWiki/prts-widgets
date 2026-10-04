import { media } from "@/utils/charImage";

import type { Enemy } from "./enemy";

/** 敌人头像：站内按名称存的方图（重名的几个敌人共用一张） */
export const enemyAvatar = (enemy: Enemy) =>
  media(`头像_敌人_${enemy.name}.png`);
