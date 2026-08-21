import {
  Container,
  Graphics,
  Text,
  TextStyle,
  type Container as ContainerType,
} from "pixi.js";

import { DIALOG_FONT_FAMILY } from "../../font";
import { STORY_HEIGHT, STORY_WIDTH, type DecisionSelection } from "../../types";

function paintButton(
  background: Graphics,
  color: number,
  width: number,
  height: number,
): void {
  background
    .clear()
    .roundRect(0, 0, width, height, 4)
    .fill({ color })
    .stroke({ color: 0xff_ff_ff, width: 2 });
}

/** 面板未经点击被清除（新 decision 顶替/销毁）时的结算值，与旧 clear(0) 一致 */
const unclickedSelection = (): DecisionSelection => ({
  optionIndex: -1,
  value: 0,
});

/**
 * Web/PIXI presentation for `Torappu.AVG.DecisionPanel._ExecuteDecision`.
 * The runtime owns predicate and skip policy; this class only blocks for a
 * selected value and adapts native option widgets to browser pointer events.
 */
export class DecisionPanel {
  private container: Container | null = null;
  private resolve: ((selection: DecisionSelection) => void) | null = null;

  constructor(private readonly layer: ContainerType) {}

  show(options: string[], values: number[]): Promise<DecisionSelection> {
    // Settle any decision this one replaces: `_ExecuteDecision` awaits the
    // selected value, so dropping the pending resolver would strand the
    // command loop in `waiting_decision` forever.
    this.clear(unclickedSelection());
    const container = new Container();
    const overlay = new Graphics()
      .rect(0, 0, STORY_WIDTH, STORY_HEIGHT)
      .fill({ alpha: 0.4, color: 0x00_00_00 });
    overlay.eventMode = "static";
    container.addChild(overlay);
    const buttonWidth = 480;
    const buttonHeight = 42;
    const stride = 64;
    const startY =
      (STORY_HEIGHT - (options.length * stride - (stride - buttonHeight))) / 2;
    const startX = (STORY_WIDTH - buttonWidth) / 2;

    for (const [index, option] of options.entries()) {
      const button = new Container();
      button.position.set(startX, startY + index * stride);
      button.eventMode = "static";
      button.cursor = "pointer";
      const background = new Graphics();
      paintButton(background, 0x30_30_30, buttonWidth, buttonHeight);
      const label = new Text({
        style: new TextStyle({
          align: "center",
          fill: "#ffffff",
          fontFamily: [DIALOG_FONT_FAMILY, "sans-serif"],
          fontSize: 20,
        }),
        text: option,
      });
      label.anchor.set(0.5);
      label.position.set(buttonWidth / 2, buttonHeight / 2);
      button.addChild(background, label);
      button.on("pointerover", () =>
        paintButton(background, 0x50_50_50, buttonWidth, buttonHeight),
      );
      button.on("pointerout", () =>
        paintButton(background, 0x30_30_30, buttonWidth, buttonHeight),
      );
      button.on("pointertap", () => {
        // 下标在点击点就是唯一的；value 可能在 options 间重复，只能由
        // runtime 写闸门，不能反查回下标（Log All 高亮依赖下标）。
        // values 由 runtime 的 parseDecision 逐项解析好传进来，这里的 0
        // 只是兜底；0 与原生 `_GetOptionValue` 的越界返回值一致。
        this.clear({ optionIndex: index, value: values[index] ?? 0 });
      });
      container.addChild(button);
    }
    this.layer.addChild(container);
    this.container = container;
    return new Promise<DecisionSelection>((resolve) => {
      this.resolve = resolve;
    });
  }

  clear(selection: DecisionSelection = unclickedSelection()): void {
    const resolve = this.resolve;
    this.resolve = null;
    this.container?.removeFromParent();
    this.container?.destroy({ children: true });
    this.container = null;
    resolve?.(selection);
  }

  destroy(): void {
    this.clear(unclickedSelection());
  }
}
