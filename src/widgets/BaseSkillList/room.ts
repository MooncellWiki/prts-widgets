import type { Room } from "./data";

/**
 * 设施色的两个来源写进 style，配合元素上的 data-rc 由 index.vue 的全局样式按主题选一个成 --rs-room
 * （亮色 = 技能名条底色 buffColor，暗色 = 进驻面板光环色）
 */
export const roomVars = (room: Room) => ({
  "--rs-c": room.color,
  "--rs-h": room.halo,
});
