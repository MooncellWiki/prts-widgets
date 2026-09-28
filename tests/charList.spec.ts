import { ref } from "vue";

import { describe, expect, it } from "vitest";

import { useChar } from "@/widgets/CharList/row/useChar";
import { Char } from "@/widgets/CharList/utils";

function makeChar(attrs: Record<string, string>) {
  const el = document.createElement("div");
  for (const [k, v] of Object.entries({
    "data-zh": "12F",
    "data-rarity": "1",
    "data-hp": "1461",
    "data-atk": "432",
    "data-def": "50",
    "data-res": "10",
    "data-cost": "24",
    "data-block": "1",
    "data-potential": "cost,atk,re_deploy,atk,cost`-1,12,-5,12,-1",
    "data-trust": "0,50,0",
    "data-sortid": "7",
    ...attrs,
  }))
    el.setAttribute(k, v);
  return new Char(el);
}

describe("Char", () => {
  it("读取连字符形式的 data 属性", () => {
    const c = makeChar({
      "data-birth-place": "哥伦比亚",
      "data-re-deploy": "70s",
      "data-obtain-method": "公开招募, 标准寻访",
    });
    expect(c.birthPlace).toBe("哥伦比亚");
    expect(c.reDeploy).toBe("70s");
    expect(c.obtainMethod).toEqual(["公开招募", "标准寻访"]);
  });

  it("兼容旧的下划线形式 data 属性", () => {
    const c = makeChar({
      "data-birth_place": "哥伦比亚",
      "data-re_deploy": "70s",
      "data-obtain_method": "公开招募, 标准寻访",
    });
    expect(c.birthPlace).toBe("哥伦比亚");
    expect(c.reDeploy).toBe("70s");
    expect(c.obtainMethod).toEqual(["公开招募", "标准寻访"]);
  });

  it("属性被 Sanitizer 丢弃时回落为空值", () => {
    const c = makeChar({});
    expect(c.birthPlace).toBe("");
    expect(c.reDeploy).toBe("");
    expect(c.obtainMethod).toEqual([]);
  });
});

describe("useChar", () => {
  it("再部署时间加算潜能", () => {
    const c = makeChar({ "data-re-deploy": "70s" });
    const { reDeploy } = useChar(c, ref(false), ref(false));
    expect(reDeploy.value).toBe("70s");
    const { reDeploy: withPotential } = useChar(c, ref(false), ref(true));
    expect(withPotential.value).toBe("65s");
  });

  it("缺少再部署时间时不抛错", () => {
    const c = makeChar({});
    const { reDeploy } = useChar(c, ref(false), ref(true));
    expect(reDeploy.value).toBe("");
  });
});
