/**
 * 地图的投影：世界坐标 x 向右（列）、y 向前（行，从下往上数）、z 向上，一格边长 1；
 * 高台高 0.4 格（BattleConsts.HIGHLAND_HEIGHT）。
 * 立体：同游戏战斗镜头，从地图正前方斜向下看（俯角 PITCH），带透视；
 * 俯视：正上方的正交投影，同作战地图的示意图。
 * 游戏里每张地图的镜头位置写在场景的 MapGraphic.CameraConfig 里（不在 gamedata），这里用一套固定参数，
 * 对着 torappu 的 map_preview（游戏内截图）调到观感接近。
 */
export const HIGHLAND_HEIGHT = 0.4;

export type ViewMode = "flat" | "persp";

export interface ScreenPoint {
  x: number;
  y: number;
  /** 离镜头的远近：越大越远，用来排画的先后 */
  depth: number;
}

/** 屏幕坐标里一格多大（SVG 单位）：俯视时正好一格，立体时是地图中部一格的大致宽度 */
export const UNIT = 40;

/** 俯角：视线和地面的夹角（度），90 是正上方 */
const PITCH = 55;
/** 镜头到地图中心的距离，按地图对角线的倍数取：越大透视越弱 */
const DISTANCE = 1.6;

export interface Camera {
  mode: ViewMode;
  project: (x: number, y: number, z?: number) => ScreenPoint;
}

export function createCamera(
  mode: ViewMode,
  width: number,
  height: number,
): Camera {
  if (mode === "flat")
    return {
      mode,
      project: (x, y, z = 0) => ({
        x: x * UNIT,
        y: (height - y) * UNIT,
        depth: -z,
      }),
    };

  const pitch = (PITCH * Math.PI) / 180;
  const cos = Math.cos(pitch);
  const sin = Math.sin(pitch);
  const cx = width / 2;
  const cy = height / 2;
  const d = DISTANCE * Math.hypot(width, height);
  // 镜头在地图中心的正前方、上方；看向中心
  const camY = cy - d * cos;
  const camZ = d * sin;
  // 让地图中心的一格在屏幕上约 UNIT 宽
  const focal = UNIT * d;
  return {
    mode,
    project(x, y, z = 0) {
      const vx = x - cx;
      const vy = y - camY;
      const vz = z - camZ;
      // 镜头坐标：右 = (1,0,0)，前 = (0,cos,−sin)，上 = (0,sin,cos)
      const depth = vy * cos - vz * sin;
      const up = vy * sin + vz * cos;
      return { x: (vx / depth) * focal, y: (-up / depth) * focal, depth };
    },
  };
}

/** 一组屏幕点的外接框，留 pad 的边 */
export function bounds(points: ScreenPoint[], pad: number) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return {
    x: minX - pad,
    y: minY - pad,
    width: maxX - minX + pad * 2,
    height: maxY - minY + pad * 2,
  };
}

export const polygon = (points: ScreenPoint[]) =>
  points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
