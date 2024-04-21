import { CargoEquip } from "./types";
import { recoverHTML } from "./utils";

const cache: Record<string, any> = {};
export async function getEquipData(name: string): Promise<any> {
  if (cache[name]) return cache[name];
  await getEquipDataAll();
  return cache[name];
}

export async function getEquipDataAll(): Promise<any> {
  const resp = await fetch(
    `/api.php?${new URLSearchParams({
      action: "cargoquery",
      format: "json",
      limit: "5000",
      tables: "char_mod",
      fields:
        "_pageName=opt,name=name,type=type,color=color,hp__full=hp,atk__full=atk,def__full=def,res__full=res,time__full=time,cost__full=cost,block__full=block,atkspd__full=atkspd,other__full=other,traitadd=add,trait,talent2,talent3,lv,favor,mat,mat2,mat3,mission1,mission2",
    })}`,
  );
  const json: { cargoquery: { title: CargoEquip }[] } = await resp.json();
  const temp: Record<string, CargoEquip[]> = {};
  for (const e of json.cargoquery) {
    if (!temp[e.title.opt]) {
      temp[e.title.opt] = [];
    }
    temp[e.title.opt].push(e.title);
  }

  for (const [opt, ce] of Object.entries(temp)) {
    const map = ce.map((e) => {
      const hp = e.hp.match(/(.*);(.*);(.*)/)?.slice(1, 4) ?? [];
      const atk = e.atk.match(/(.*);(.*);(.*)/)?.slice(1, 4) ?? [];
      const def = e.def.match(/(.*);(.*);(.*)/)?.slice(1, 4) ?? [];
      const res = e.res.match(/(.*);(.*);(.*)/)?.slice(1, 4) ?? [];
      const time = e.time.match(/(.*);(.*);(.*)/)?.slice(1, 4) ?? [];
      const cost = e.cost.match(/(.*);(.*);(.*)/)?.slice(1, 4) ?? [];
      const block = e.block.match(/(.*);(.*);(.*)/)?.slice(1, 4) ?? [];
      const atkspd = e.atkspd.match(/(.*);(.*);(.*)/)?.slice(1, 4) ?? [];
      const other = e.other.match(/(.*);;(.*);;(.*)/)?.slice(1, 4) ?? [];
      return {
        opt: e.opt,
        name: e.name,
        type: e.type,
        color: e.color,
        hp: hp[0] ?? "",
        hp2: hp[1] ?? "",
        hp3: hp[2] ?? "",
        def: def[0] ?? "",
        def2: def[1] ?? "",
        def3: def[2] ?? "",
        atk: atk[0] ?? "",
        atk2: atk[1] ?? "",
        atk3: atk[2] ?? "",
        res: res[0] ?? "",
        res2: res[1] ?? "",
        res3: res[2] ?? "",
        time: time[0] ?? "",
        time2: time[1] ?? "",
        time3: time[2] ?? "",
        cost: cost[0] ?? "",
        cost2: cost[1] ?? "",
        cost3: cost[2] ?? "",
        block: block[0] ?? "",
        block2: block[1] ?? "",
        block3: block[2] ?? "",
        atkspd: atkspd[0] ?? "",
        atkspd2: atkspd[1] ?? "",
        atkspd3: atkspd[2] ?? "",
        other: other[0] ?? "",
        other2: other[1] ?? "",
        other3: other[2] ?? "",
        add: e.add,
        trait: recoverHTML(e.trait),
        talent2: recoverHTML(e.talent2),
        talent3: recoverHTML(e.talent3),
        mission1: recoverHTML(e.mission1),
        mission2: recoverHTML(e.mission2),
        mat: recoverHTML(e.mat),
        mat2: recoverHTML(e.mat2),
        mat3: recoverHTML(e.mat3),
        lv: e.lv ?? "???",
        favor: e.favor ?? "???",
      };
    });
    cache[opt] = map;
  }
}
