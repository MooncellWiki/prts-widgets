import {
  Container,
  Graphics,
  Text,
  TextStyle,
  type Container as ContainerType,
} from "pixi.js";

import { DIALOG_FONT_FAMILY, DIALOG_FONT_WEIGHT } from "../../font";
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

/**
 * Web adapter for `Torappu.AVG.DecisionPanel`'s option widgets. Presents the
 * options and reports selection immediately. Native OnFinish (2791 @
 * 0x1841C7150) closes the view when the executor finishes at frame end.
 */
export class DecisionView {
  private container: Container | null = null;

  constructor(private readonly layer: ContainerType) {}

  show(
    options: string[],
    values: number[],
    disabledOptions: boolean[],
    onSelect: (selection: DecisionSelection) => void,
  ): void {
    this.clear();
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
      // Native `_SetupOptionText`（0x183e718a0）：`&` 前缀项剥前缀后
      // `interactable = false`。前缀已在 log/semantics.parseDecision 剥掉，
      // 这里只负责禁用的呈现：灰底灰字、无手型、不注册指针事件
      // （按钮保持 passive，点击穿透到遮罩，不会误结算）。
      const disabled = disabledOptions[index] ?? false;
      const button = new Container();
      button.position.set(startX, startY + index * stride);
      const background = new Graphics();
      paintButton(
        background,
        disabled ? 0x1c_1c_1c : 0x30_30_30,
        buttonWidth,
        buttonHeight,
      );
      const label = new Text({
        style: new TextStyle({
          align: "center",
          fill: disabled ? "#8c8c8c" : "#ffffff",
          fontFamily: [DIALOG_FONT_FAMILY, "sans-serif"],
          fontSize: 20,
          fontWeight: DIALOG_FONT_WEIGHT,
        }),
        text: option,
      });
      label.anchor.set(0.5);
      label.position.set(buttonWidth / 2, buttonHeight / 2);
      button.addChild(background, label);
      if (!disabled) {
        button.eventMode = "static";
        button.cursor = "pointer";
        button.on("pointerover", () =>
          paintButton(background, 0x50_50_50, buttonWidth, buttonHeight),
        );
        button.on("pointerout", () =>
          paintButton(background, 0x30_30_30, buttonWidth, buttonHeight),
        );
        button.on("pointertap", () => {
          // Log All 高亮用点击下标，闸门用 value。同一 value 可对应多个选项。
          // values 由 DecisionPanel 的 parseDecision 逐项解析，这里的 0
          // 只是兜底；0 与原生 `_GetOptionValue` 的越界返回值一致。
          onSelect({ optionIndex: index, value: values[index] ?? 0 });
        });
      }
      container.addChild(button);
    }
    this.layer.addChild(container);
    this.container = container;
  }

  clear(): void {
    this.container?.removeFromParent();
    this.container?.destroy({ children: true });
    this.container = null;
  }

  destroy(): void {
    this.clear();
  }
}
