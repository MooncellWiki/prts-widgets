import {
  Assets,
  CanvasTextMetrics,
  Sprite,
  Text,
  TextStyle,
  Texture,
} from "pixi.js";

import { DIALOG_FRAME_URL } from "../../../assets";
import { DIALOG_FONT_FAMILY } from "../../font";
import { STORY_HEIGHT, STORY_WIDTH } from "../../types";

import type { Container } from "pixi.js";

export class DialogPanel {
  private bottomGradient: Sprite | null = null;
  private dialogue: Text | null = null;
  private panel: Sprite | null = null;
  private speaker: Text | null = null;
  private topGradient: Sprite | null = null;

  private static readonly BOTTOM_HEIGHT = 182;
  private static readonly NAME_LEFT = 20.7501;
  private static readonly NAME_WIDTH = 312.3;
  private static readonly NAME_TOP = 84.9;
  private static readonly NAME_FONT_MAX = 30;
  private static readonly NAME_FONT_MIN = 25;
  private static readonly MESSAGE_LEFT = 23.88;
  private static readonly MESSAGE_ANCHOR_X = 0.28;
  private static readonly MESSAGE_TOP = 93.5;
  private static readonly MESSAGE_WIDTH = 735;
  private static readonly MESSAGE_MAX_HEIGHT = 89;
  private static readonly NAME_MAX_HEIGHT = 65;

  constructor(
    private readonly layer: Container,
    private readonly warn?: (detail: string) => void,
  ) {}

  async mount(): Promise<void> {
    let top: Sprite | null = null;
    let bottom: Sprite | null = null;
    try {
      const texture = await Assets.load<Texture>(DIALOG_FRAME_URL);
      top = new Sprite(texture);
      top.width = STORY_WIDTH;
      top.height = 102;
      top.anchor.set(0, 1);
      top.scale.y *= -1;
      top.position.set(0, 0);
      top.tint = 0x20_21_25;
      top.alpha = 0.7059;
      bottom = new Sprite(texture);
      bottom.width = STORY_WIDTH;
      bottom.height = DialogPanel.BOTTOM_HEIGHT;
      bottom.position.set(0, STORY_HEIGHT - DialogPanel.BOTTOM_HEIGHT);
    } catch {
      this.warn?.("failed ui: sprite_avg_cutscene");
    }

    const panel = new Sprite(Texture.WHITE);
    Object.assign(panel, {
      alpha: 0.72,
      height: 170,
      tint: 0x00_00_00,
      width: STORY_WIDTH - 40,
      x: 20,
      y: STORY_HEIGHT - 190,
    });
    const speaker = new Text({
      style: new TextStyle({
        align: "right",
        fill: "#929292",
        fontFamily: [DIALOG_FONT_FAMILY, "sans-serif"],
        fontSize: DialogPanel.NAME_FONT_MAX,
        fontWeight: "700",
      }),
      text: "",
    });
    speaker.anchor.set(1, 0);
    speaker.position.set(
      DialogPanel.NAME_LEFT + DialogPanel.NAME_WIDTH,
      STORY_HEIGHT - DialogPanel.BOTTOM_HEIGHT + DialogPanel.NAME_TOP,
    );
    const dialogue = new Text({
      style: new TextStyle({
        align: "left",
        breakWords: true,
        fill: "#ffffff",
        fontFamily: [DIALOG_FONT_FAMILY, "sans-serif"],
        fontSize: 24,
        fontWeight: "700",
        lineHeight: 0,
        whiteSpace: "pre",
        wordWrap: true,
        wordWrapWidth: DialogPanel.MESSAGE_WIDTH,
      }),
      text: "",
    });
    dialogue.position.set(
      STORY_WIDTH * DialogPanel.MESSAGE_ANCHOR_X + DialogPanel.MESSAGE_LEFT,
      STORY_HEIGHT - DialogPanel.MESSAGE_TOP,
    );

    this.topGradient = top;
    this.bottomGradient = bottom;
    this.panel = panel;
    this.speaker = speaker;
    this.dialogue = dialogue;
    if (top) this.layer.addChild(top);
    if (bottom) this.layer.addChild(bottom);
    this.layer.addChild(speaker, dialogue);
  }

  setDialogue(
    speaker: string,
    text: string,
    tagStyles?: Record<string, { fill: string }>,
  ): void {
    if (this.speaker) {
      this.speaker.text = speaker;
      this.applyNameBestFit(speaker);
    }
    if (this.dialogue) {
      if (tagStyles) this.dialogue.style.tagStyles = tagStyles;
      this.dialogue.text = text;
    }
    this.applyLayout();
    const visible = Boolean(speaker || text);
    for (const item of [
      this.topGradient,
      this.bottomGradient,
      this.panel,
      this.speaker,
      this.dialogue,
    ]) {
      if (item) item.visible = visible;
    }
  }

  destroy(): void {
    this.topGradient = null;
    this.bottomGradient = null;
    this.panel = null;
    this.speaker = null;
    this.dialogue = null;
  }

  private applyNameBestFit(name: string): void {
    if (!this.speaker) return;
    for (
      let size = DialogPanel.NAME_FONT_MAX;
      size >= DialogPanel.NAME_FONT_MIN;
      size -= 1
    ) {
      this.speaker.style.fontSize = size;
      if (
        !name ||
        CanvasTextMetrics.measureText(name, this.speaker.style).width <=
          DialogPanel.NAME_WIDTH
      )
        return;
    }
  }

  private applyLayout(): void {
    if (this.dialogue) {
      const height = this.dialogue.text
        ? CanvasTextMetrics.measureText(this.dialogue.text, this.dialogue.style)
            .height
        : 0;
      this.dialogue.y =
        STORY_HEIGHT -
        DialogPanel.MESSAGE_TOP -
        Math.max(0, height - DialogPanel.MESSAGE_MAX_HEIGHT);
    }
    if (this.speaker) {
      const height = this.speaker.text
        ? CanvasTextMetrics.measureText(this.speaker.text, this.speaker.style)
            .height
        : 0;
      this.speaker.y =
        STORY_HEIGHT -
        DialogPanel.BOTTOM_HEIGHT +
        DialogPanel.NAME_TOP -
        Math.max(0, height - DialogPanel.NAME_MAX_HEIGHT);
    }
  }
}
