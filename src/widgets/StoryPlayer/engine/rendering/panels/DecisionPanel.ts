import {
  Container,
  Graphics,
  Text,
  TextStyle,
  type Container as ContainerType,
} from "pixi.js";

import { DIALOG_FONT_FAMILY } from "../../font";
import { STORY_HEIGHT, STORY_WIDTH } from "../../types";

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

/**
 * Web/PIXI presentation for `Torappu.AVG.DecisionPanel._ExecuteDecision`.
 * The runtime owns predicate and skip policy; this class only blocks for a
 * selected value and adapts native option widgets to browser pointer events.
 */
export class DecisionPanel {
  private container: Container | null = null;
  private resolve: ((value: number) => void) | null = null;

  constructor(private readonly layer: ContainerType) {}

  show(options: string[], values: number[]): Promise<number> {
    // Settle any decision this one replaces: `_ExecuteDecision` awaits the
    // selected value, so dropping the pending resolver would strand the
    // command loop in `waiting_decision` forever.
    this.clear(0);
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
        const resolve = this.resolve;
        this.clear();
        resolve?.(values[index] ?? index + 1);
      });
      container.addChild(button);
    }
    this.layer.addChild(container);
    this.container = container;
    return new Promise<number>((resolve) => {
      this.resolve = resolve;
    });
  }

  clear(resolveValue?: number): void {
    const resolve = this.resolve;
    this.resolve = null;
    this.container?.removeFromParent();
    this.container?.destroy({ children: true });
    this.container = null;
    if (resolveValue !== undefined) resolve?.(resolveValue);
  }

  destroy(): void {
    this.clear(0);
  }
}
