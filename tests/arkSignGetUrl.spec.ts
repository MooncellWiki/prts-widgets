import { describe, expect, it } from "vitest";

import { equip } from "../src/widgets/ArkSign/getUrl";

describe("ArkSign equip", () => {
  it("lowercases typeIcon to match torappu file names", () => {
    expect(equip("WAH-Y")).toBe(
      "https://torappu.prts.wiki/assets/uniequip_direction/wah-y.png",
    );
    expect(equip("dec-X")).toBe(
      "https://torappu.prts.wiki/assets/uniequip_direction/dec-x.png",
    );
  });
});
