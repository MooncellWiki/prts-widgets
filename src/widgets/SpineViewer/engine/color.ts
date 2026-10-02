/** 取色面板用的 HSV ↔ #rrggbb（不走 <input type="color">：各浏览器 / 系统弹出的取色面板长得都不一样） */

/** h 0–360，s / v 0–1 */
export interface Hsv {
  h: number;
  s: number;
  v: number;
}

const HEX_RE = /^#?(?:[\da-f]{3}|[\da-f]{6})$/i;

/** 认 #rgb / #rrggbb（# 可省），统一成小写 #rrggbb；认不出给 null */
export function normalizeHex(input: string): string | null {
  const s = input.trim();
  if (!HEX_RE.test(s)) return null;
  const body = s.replace("#", "").toLowerCase();
  return `#${
    body.length === 3
      ? body
          .split("")
          .map((c) => c + c)
          .join("")
      : body
  }`;
}

export function hsvToHex({ h, s, v }: Hsv): string {
  const f = (n: number) => {
    const k = (n + h / 60) % 6;
    const c = v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
    return Math.round(c * 255)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${f(5)}${f(3)}${f(1)}`;
}

/** 灰色（s = 0）或黑色（v = 0）没有色相，给 fallbackHue——拖到角上时色相条不跳回红色 */
export function hexToHsv(hex: string, fallbackHue = 0): Hsv {
  const n = Number.parseInt(hex.slice(1), 16);
  const r = (n >> 16) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  let h = fallbackHue;
  if (d && max) {
    if (max === r) h = 60 * (((g - b) / d + 6) % 6);
    else if (max === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
  }
  return { h, s: max ? d / max : 0, v: max };
}
