import type { Room } from "./data";

/** 白色线稿当遮罩：颜色由 background: currentColor 定（.rs-glyph） */
export const glyphStyle = (src: string) => ({ maskImage: `url("${src}")` });

/**
 * 设施线稿的画布都是 23px 见方，墨迹框的中心离画布中心都在 0.5px 以内，只有训练室的哑铃偏左上
 * （墨迹中心 (10, 11)，画布中心 11.5）。按边长的比例挪回来，线稿 13 / 16 / 20px 三种大小都对得上
 */
const GLYPH_SHIFT: Record<string, string> = {
  TRAINING: "translate(6.5%, 2.2%)",
};

export const roomGlyphStyle = (room: Room) => ({
  ...glyphStyle(room.glyph),
  transform: GLYPH_SHIFT[room.id],
});

/**
 * 设施色的两个来源写进 style，配合元素上的 data-rc 由 index.vue 的全局样式按主题选一个成 --rs-room
 * （亮色 = 技能名条底色 buffColor，暗色 = 进驻面板光环色）
 */
export const roomVars = (room: Room) => ({
  "--rs-c": room.color,
  "--rs-h": room.halo,
});
