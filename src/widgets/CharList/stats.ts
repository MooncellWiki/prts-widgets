import type { StatKey } from "./consts";
import type { Char } from "./utils";

export interface CharStats {
  hp: number;
  atk: number;
  def: number;
  res: number;
  reDeploy: string;
  cost: number;
  block: number;
  interval: string;
  /** 加算了潜能 / 信赖、与基础值不同的项 */
  mod: Partial<Record<StatKey, boolean>>;
}

/** 八项数值，按开关加算满潜能 / 满信赖 */
export function charStats(
  char: Char,
  addPotential: boolean,
  addTrust: boolean,
): CharStats {
  const pot = (type: string) =>
    addPotential
      ? char.potential.reduce(
          (sum, p) => sum + (p.type === type ? p.value : 0),
          0,
        )
      : 0;
  const trust = (i: number) => (addTrust ? char.trust[i] || 0 : 0);

  const hp = char.hp + trust(0) + pot("hp");
  const atk = char.atk + trust(1) + pot("atk");
  const def = char.def + trust(2) + pot("def");
  const res = char.res + pot("res");
  const cost = char.cost + pot("cost");
  // 再部署时间是「70s」这样的字符串；不是数字开头的（召唤物等）原样显示
  const seconds = Number.parseInt(char.reDeploy);
  const reDeploy = Number.isNaN(seconds)
    ? char.reDeploy
    : `${seconds + pot("re_deploy")}s`;

  return {
    hp,
    atk,
    def,
    res,
    reDeploy,
    cost,
    block: char.block,
    interval: char.interval,
    mod: {
      hp: hp !== char.hp,
      atk: atk !== char.atk,
      def: def !== char.def,
      res: res !== char.res,
      cost: cost !== char.cost,
      reDeploy: reDeploy !== char.reDeploy,
    },
  };
}

/** 排序用的数值：「70s」「1.05s」取开头的数字，取不出来是 null（排到最后） */
export function statNumber(value: number | string): number | null {
  const n = typeof value === "number" ? value : Number.parseFloat(value);
  return Number.isNaN(n) ? null : n;
}

/** 「70s」拆成数字和单位，单位在界面上排小一号 */
export function splitUnit(value: number | string): [string, string] {
  const m = /^([\d.]+)s$/.exec(String(value));
  return m ? [m[1], "s"] : [String(value), ""];
}
