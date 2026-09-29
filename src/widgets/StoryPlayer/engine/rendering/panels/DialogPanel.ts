import {
  Assets,
  CanvasTextMetrics,
  Container,
  Sprite,
  Text,
  TextStyle,
  type Texture,
} from "pixi.js";

import { DIALOG_FRAME_URL } from "../../../assets";
import { DIALOG_FONT_FAMILY, DIALOG_FONT_WEIGHT } from "../../font";
import { STORY_HEIGHT, STORY_WIDTH, type DialogueLayout } from "../../types";

import type { RichTagStyles } from "../../richtext";

/**
 * Web/PIXI reconstruction of the visual surface used by
 * `Torappu.AVG.DialogPanel._ExecuteDialog`. Command sequencing, typewriter,
 * and click semantics remain in the runtime; this class adapts scene-authored
 * Unity UI layout and text measurement to PIXI.
 */
export class DialogPanel {
  private dialogue: Text | null = null;
  private speaker: Text | null = null;
  /** Stands in for the CanvasGroup on `panel_dialog`; hiding fades its alpha. */
  private root: Container | null = null;
  /** Native `m_hidden`; `OnReset` forces it true with alpha 0, no tween. */
  private hidden = true;
  private fadeSessionId = 0;
  /** Native `m_isMessageWidthExpanded`. */
  private messageWidthExpanded = false;

  private static readonly BOTTOM_HEIGHT = 182;
  private static readonly NAME_LEFT = 20.7501;
  private static readonly NAME_WIDTH = 312.3;
  private static readonly NAME_TOP = 84.9;
  private static readonly NAME_FONT_MAX = 30;
  private static readonly NAME_FONT_MIN = 25;
  private static readonly MESSAGE_LEFT = 23.88;
  private static readonly MESSAGE_ASIDE_LEFT = -86;
  private static readonly MESSAGE_ANCHOR_X = 0.28;
  private static readonly MESSAGE_TOP = 93.5;
  private static readonly MESSAGE_WIDTH = 735;
  private static readonly MESSAGE_MAX_HEIGHT = 89;
  private static readonly NAME_MAX_HEIGHT = 65;
  private static readonly HIDE_FADE_MS = 150;

  constructor(
    private readonly layer: Container,
    private readonly warn?: (detail: string) => void,
    private readonly tween?: (
      durationMs: number,
      step: (progress: number) => void,
      done?: () => void,
    ) => Promise<void>,
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

    const speaker = new Text({
      style: new TextStyle({
        align: "right",
        fill: "#929292",
        fontFamily: [DIALOG_FONT_FAMILY, "sans-serif"],
        fontSize: DialogPanel.NAME_FONT_MAX,
        fontWeight: DIALOG_FONT_WEIGHT,
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
        fontWeight: DIALOG_FONT_WEIGHT,
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

    const root = new Container();
    root.alpha = 0;
    root.visible = false;
    if (top) root.addChild(top);
    if (bottom) root.addChild(bottom);
    root.addChild(speaker, dialogue);

    this.speaker = speaker;
    this.dialogue = dialogue;
    this.root = root;
    this.layer.addChild(root);
  }

  setDialogue(
    speaker: string,
    text: string,
    tagStyles?: RichTagStyles,
    layout?: DialogueLayout,
  ): void {
    if (this.speaker) {
      this.speaker.text = speaker;
      this.applyNameBestFit(speaker);
    }
    if (this.dialogue) {
      if (tagStyles) this.dialogue.style.tagStyles = tagStyles;
      this.dialogue.text = text;
    }
    this.applyLayout(layout);
    this.setHidden(false);
  }

  /**
   * Native port: the empty-content branches of `_ExecuteDialog` /
   * `_ExecuteMultiline` only call `set_isHidden(true)`. `_name`/`_message`
   * keep the last text, which fades out together with the frame.
   */
  hide(): void {
    this.setHidden(true);
  }

  /**
   * Native port: `_RestoreMessageWidth`, which `OnFinish` / `ForceCommandEnd`
   * run as each DialogPanel command ends. The text still on screen re-wraps
   * at the original width.
   */
  restoreMessageWidth(): void {
    if (!this.dialogue || !this.messageWidthExpanded) return;
    this.dialogue.style.wordWrapWidth = DialogPanel.MESSAGE_WIDTH;
    this.messageWidthExpanded = false;
  }

  destroy(): void {
    this.fadeSessionId += 1;
    this.root = null;
    this.speaker = null;
    this.dialogue = null;
  }

  /**
   * Native port: `DialogPanel._SetHiddenInternal(value, force: false)`. A no-op
   * unless `m_hidden` flips; otherwise DOKill + DOFade the CanvasGroup from its
   * current alpha to 0/1 over `_hideDuration` (0.15s) with `_hideEase`
   * (Linear), unscaled -- showing fades in just like hiding fades out.
   */
  private setHidden(value: boolean): void {
    const root = this.root;
    if (!root || this.hidden === value) return;
    this.hidden = value;
    const session = ++this.fadeSessionId;
    const from = root.alpha;
    const to = value ? 0 : 1;
    root.visible = true;
    if (!this.tween) {
      root.alpha = to;
      root.visible = !value;
      return;
    }
    void this.tween(
      DialogPanel.HIDE_FADE_MS,
      (progress) => {
        if (session === this.fadeSessionId)
          root.alpha = from + (to - from) * progress;
      },
      () => {
        if (session === this.fadeSessionId && value) root.visible = false;
      },
    );
  }

  private measureMessage(text: string): number {
    if (!this.dialogue || !text) return 0;
    return CanvasTextMetrics.measureText(text, this.dialogue.style).height;
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

  /**
   * Native port: `_CalcMessageLayoutDelta` + `_ApplyMessagePosition` run once
   * per command on its own content, not on what the typewriter has revealed:
   * the message does not creep up mid-typing, and a multiline run is placed
   * for its newest fragment only. Without `layout` the message stays put.
   */
  private applyLayout(layout?: DialogueLayout): void {
    if (this.dialogue && layout) {
      this.dialogue.x =
        STORY_WIDTH * DialogPanel.MESSAGE_ANCHOR_X +
        (layout.executor === "aside"
          ? DialogPanel.MESSAGE_ASIDE_LEFT
          : DialogPanel.MESSAGE_LEFT);
      let height = this.measureMessage(layout.text);
      // Native port: `_TryExpandMessageWidthOnOverflow`. Once the content
      // reaches the max height (warnDelta = height - 89 >= 0), widen the
      // message by one character (`_GetSingleCharacterWidth` = fontSize) for
      // the rest of the command and measure again. Only one widening per
      // command; `restoreMessageWidth` undoes it. `_ExecuteEndtip` skips it.
      if (
        layout.executor !== "endtip" &&
        height - DialogPanel.MESSAGE_MAX_HEIGHT >= 0 &&
        !this.messageWidthExpanded
      ) {
        this.dialogue.style.wordWrapWidth =
          DialogPanel.MESSAGE_WIDTH + this.dialogue.style.fontSize;
        this.messageWidthExpanded = true;
        height = this.measureMessage(layout.text);
      }
      this.dialogue.y =
        STORY_HEIGHT -
        DialogPanel.MESSAGE_TOP -
        Math.max(0, height - DialogPanel.MESSAGE_MAX_HEIGHT);
      // The frame does not follow the message: native `_textContainer`
      // (sprite_frame_bottom) is resized only by `_ApplyTextContainerHeight`
      // from the dialog preset / font-size settings, so it stays 182px here.
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
