import type { Room } from "./data";

/** 白色线稿当遮罩：颜色由 background: currentColor 定（.rs-glyph） */
export const glyphStyle = (src: string) => ({ maskImage: `url("${src}")` });

/**
 * 设施色的两个来源写进 style，配合元素上的 data-rc 由 index.vue 的全局样式按主题选一个成 --rs-room
 * （亮色 = 技能名条底色 buffColor，暗色 = 进驻面板光环色）
 */
export const roomVars = (room: Room) => ({
  "--rs-c": room.color,
  "--rs-h": room.halo,
});
