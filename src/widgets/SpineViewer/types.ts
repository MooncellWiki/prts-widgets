/** torappu.prts.wiki/assets/char_spine/<charId>/meta.json，或 {{spineId}} 写在 #SPINEDATA 里的同一份结构 */
export interface SpineMeta {
  /** 模型文件的地址前缀 */
  prefix: string;
  /** 干员名（导出的文件名用） */
  name: string;
  /** 时装 → 模型（正面 / 背面 / 基建）→ 文件 */
  skin: {
    [skin: string]: {
      [model: string]: {
        file: string;
        /** 骨骼里的 skin 名（一份骨骼装了几套时装时） */
        skin?: string;
      };
    };
  };
}
