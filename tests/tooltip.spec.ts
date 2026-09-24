import { beforeEach, describe, expect, it, vi } from "vitest";

import { Char } from "../src/widgets/CharList/utils";

describe("global tooltip does not cannibalize the source DOM", () => {
  beforeEach(() => {
    document.head.innerHTML = "";
    document.body.innerHTML = `
      <div style="display:none" id="filter-data">
        <div data-zh="测试干员" data-rarity="6" data-sortid="1"
             data-profession="先锋" data-subprofession="尖兵"
             data-cost="9→11" data-block="2">阻挡的敌人被<span class="mc-tooltips"><span class="term">鼓舞</span><span style="display:none" data-size="350" data-interactive="true"><strong>术语: 鼓舞</strong>说明文字</span></span>影响</div>
      </div>
      <div id="root"></div>`;
  });

  it("keeps both children after the head entry has scanned the page", async () => {
    // head 里的 Tooltip.js 是 defer module，先于 body 里的小部件入口执行
    await import("../src/entries/Tooltip");

    const row = document.querySelector<HTMLDivElement>("#filter-data > div")!;
    const tip = row.querySelector(".mc-tooltips")!;
    expect(tip.children).toHaveLength(2);
    expect((tip.children[1] as HTMLElement).style.display).toBe("none");

    // 小部件随后才把 DOM 当数据源读；term 上的 aria-expanded 是 tippy
    // 挂载留下的，证明入口确实扫到了这一行
    const char = new Char(row);
    expect(char.feature).toBe(
      '阻挡的敌人被<span class="mc-tooltips"><span class="term" aria-expanded="false">鼓舞</span><span style="display:none" data-size="350" data-interactive="true"><strong>术语: 鼓舞</strong>说明文字</span></span>影响',
    );
    expect(char.plainFeature).toBe("阻挡的敌人被鼓舞影响");
  });

  it('treats data-interactive="false" as not interactive', async () => {
    // 模块只会 start() 一次，这批节点走的是 MutationObserver 那条路
    await import("../src/entries/Tooltip");
    document.body.innerHTML = `
      <span class="mc-tooltips" id="on"><span>甲</span><span style="display:none" data-interactive="true">A</span></span>
      <span class="mc-tooltips" id="off"><span>乙</span><span style="display:none" data-interactive="false">B</span></span>
      <span class="mc-tooltips" id="none"><span>丙</span><span style="display:none">C</span></span>`;

    const interactive = (id: string) =>
      (
        document.querySelector(`#${id} > span`) as HTMLElement & {
          _tippy?: { props: { interactive: boolean } };
        }
      )._tippy!.props.interactive;

    // MutationObserver 回调是异步的：tippy 挂上之前 _tippy 为空，断言会抛错重试
    await vi.waitFor(() => {
      expect(interactive("on")).toBe(true);
      expect(interactive("off")).toBe(false);
      expect(interactive("none")).toBe(false);
    });
  });
});
