// gifenc 没带类型，这里只声明 SpineViewer 导出 GIF 用到的几个（签名照 node_modules/gifenc/src）
declare module "gifenc" {
  type Format = "rgb565" | "rgb444" | "rgba4444";
  type Palette = number[][];

  export function quantize(
    rgba: Uint8Array | Uint8ClampedArray,
    maxColors: number,
    opts?: {
      format?: Format;
      /** true = 127；给数字就是阈值，alpha 不超过它的算全透明 */
      oneBitAlpha?: boolean | number;
      clearAlpha?: boolean;
      clearAlphaThreshold?: number;
      clearAlphaColor?: number;
    },
  ): Palette;

  export function applyPalette(
    rgba: Uint8Array | Uint8ClampedArray,
    palette: Palette,
    format?: Format,
  ): Uint8Array;

  export function GIFEncoder(): {
    writeFrame: (
      index: Uint8Array,
      width: number,
      height: number,
      opts?: {
        /** 第一帧必给（写成全局色表）；之后的帧给了就是局部色表 */
        palette?: Palette;
        /** 毫秒，编码时 / 10 取整成厘秒 */
        delay?: number;
        /** -1 播一遍，0 一直循环，n 再重复 n 次；只认第一帧的 */
        repeat?: number;
        transparent?: boolean;
        transparentIndex?: number;
        dispose?: number;
      },
    ) => void;
    finish: () => void;
    // 底下是普通 ArrayBuffer（stream.js 自己 new 的），标出来 new Blob 才收
    bytes: () => Uint8Array<ArrayBuffer>;
    bytesView: () => Uint8Array<ArrayBuffer>;
  };
}
