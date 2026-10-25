import { TORAPPU_ENDPOINT } from "@/utils/consts";

/** 图都从 torappu 取（游戏解包，同干员一览 / 公招计算），站内 media 上那几张手传的不用 */
const torappu = (path: string) => `${TORAPPU_ENDPOINT}/assets/${path}.png`;

/**
 * 设施线稿：游戏进驻面板技能图标外圈的那套白色线稿（arts/building/buffs/buff_icon_hub，23px，
 * 文件名是小写的 RoomType）；当 CSS 遮罩用，颜色跟设施色走
 */
export const roomGlyph = (room: string) =>
  torappu(`building_buff_icon/${room.toLowerCase()}`);

/** 技能图标（白色线稿），同现网 模板:后勤技能信息查询 */
export const skillIcon = (icon: string) => torappu(`build_skill_icon/${icon}`);

/** 精英图标（白色线稿，亮色主题下 .ak-elite 反相为黑） */
export const eliteIcon = (phase: number) =>
  torappu(`elite_icon/elite_${phase}`);

/** 头像右下角的黄色星级原图，同首页的干员卡 */
export const rarityIcon = (stars: number) =>
  torappu(`rarity_icon/rarity_yellow_${stars - 1}`);

/**
 * 职业白线稿（透明底，游戏筛选面板同款）：筛选芯片里当 CSS 遮罩用（同干员一览）；
 * 干员卡左上角也用它——卡上那一格本来就垫着半透明黑底，同游戏里白线稿压在深色底上
 */
export const professionLine = (profession: string) =>
  torappu(`profession_icon/icon_profession_${profession.toLowerCase()}`);

export const wikiLink = (zh: string) => `/w/${encodeURIComponent(zh)}`;
