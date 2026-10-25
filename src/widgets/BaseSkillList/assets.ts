import { media } from "@/utils/charImage";
import { TORAPPU_ENDPOINT } from "@/utils/consts";

import control from "./assets/building/control.png";
import dormitory from "./assets/building/dormitory.png";
import hire from "./assets/building/hire.png";
import manufacture from "./assets/building/manufacture.png";
import meeting from "./assets/building/meeting.png";
import power from "./assets/building/power.png";
import recycle from "./assets/building/recycle.png";
import trading from "./assets/building/trading.png";
import training from "./assets/building/training.png";
import workshop from "./assets/building/workshop.png";
import { professionName, type Glyph } from "./consts";

/**
 * 设施线稿：游戏进驻面板技能图标用的那套白色线稿（arts/building/buffs/buff_icon_hub，23px），
 * torappu 上没有，随包带着（都不到 1KB，构建时内联成 data URI）；当 CSS 遮罩用，颜色跟设施色走
 */
export const ROOM_GLYPHS: Record<Glyph, string> = {
  control,
  power,
  manufacture,
  trading,
  dormitory,
  workshop,
  hire,
  training,
  recycle,
  meeting,
};

/** 技能图标（白色线稿），同现网 模板:后勤技能信息查询 */
export const skillIcon = (icon: string) =>
  `${TORAPPU_ENDPOINT}/assets/build_skill_icon/${icon}.png`;

/** 精英图标（白色线稿，亮色主题下 .ak-elite 反相为黑），同现网 模板:后勤技能信息/char */
export const eliteIcon = (phase: number) => media(`精英_${phase}.png`);

/** 头像右下角的黄色星级原图，同首页的干员卡 */
export const rarityIcon = (stars: number) =>
  media(`稀有度_黄_${stars - 1}.png`);

/** 头像左上角的职业小图标（游戏头像同款，自带深底），同干员一览 */
export const professionBadge = (profession: string) =>
  media(`图标_职业_${professionName(profession)}.png`);

/** 职业白线稿（透明底，游戏筛选面板同款）：当 CSS 遮罩用，同干员一览的职业芯片 */
export const professionLine = (profession: string) =>
  `${TORAPPU_ENDPOINT}/assets/profession_icon/icon_profession_${profession.toLowerCase()}.png`;

export const wikiLink = (zh: string) => `/w/${encodeURIComponent(zh)}`;
