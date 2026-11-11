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
import {
  buildTagStyles,
  colorTagName,
  HIDDEN_TEXT_COLOR,
  richCharsToTaggedText,
} from "../../richtext";
import {
  STORY_HEIGHT,
  STORY_WIDTH,
  type DialogueLayout,
  type TypewriterText,
} from "../../types";

interface DialogueLine {
  chars: TypewriterText["chars"];
  startIndex: number;
}

/**
 * Web adapter for the visual responsibilities of `Torappu.AVG.DialogPanel`.
 * Adapts Unity's CanvasGroup, layout and text measurement to PIXI.
 */
export class DialogView {
  private dialogue: Text | null = null;
  private speaker: Text | null = null;
  /** Stands in for the CanvasGroup on `panel_dialog`; hiding fades its alpha. */
  private root: Container | null = null;
  /** Native `m_hidden`; `OnReset` forces it true with alpha 0, no tween. */
  private hidden = true;
  private fadeSessionId = 0;
  /** Native `m_isMessageWidthExpanded`. */
  private messageWidthExpanded = false;
  private messageChars: TypewriterText["chars"] | null = null;
  private fullText = "";
  private wrappedLines: DialogueLine[] | null = null;

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
      bottom.height = DialogView.BOTTOM_HEIGHT;
      bottom.position.set(0, STORY_HEIGHT - DialogView.BOTTOM_HEIGHT);
    } catch {
      this.warn?.("failed ui: sprite_avg_cutscene");
    }

    const speaker = new Text({
      style: new TextStyle({
        align: "right",
        fill: "#929292",
        fontFamily: [DIALOG_FONT_FAMILY, "sans-serif"],
        fontSize: DialogView.NAME_FONT_MAX,
        fontWeight: DIALOG_FONT_WEIGHT,
      }),
      text: "",
    });
    speaker.anchor.set(1, 0);
    speaker.position.set(
      DialogView.NAME_LEFT + DialogView.NAME_WIDTH,
      STORY_HEIGHT - DialogView.BOTTOM_HEIGHT + DialogView.NAME_TOP,
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
        wordWrapWidth: DialogView.MESSAGE_WIDTH,
      }),
      text: "",
    });
    dialogue.position.set(
      STORY_WIDTH * DialogView.MESSAGE_ANCHOR_X + DialogView.MESSAGE_LEFT,
      STORY_HEIGHT - DialogView.MESSAGE_TOP,
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
    { chars, visibleCount }: TypewriterText,
    layout?: DialogueLayout,
  ): void {
    const dialogue = this.dialogue;
    if (!dialogue) return;
    const revealing = visibleCount < chars.length;
    if (this.messageChars !== chars || layout) {
      this.messageChars = chars;
      if (this.speaker) {
        this.speaker.text = speaker;
        this.applyNameBestFit(speaker);
      }
      dialogue.style.tagStyles = {
        ...buildTagStyles(chars),
        [colorTagName(HIDDEN_TEXT_COLOR)]: { fill: HIDDEN_TEXT_COLOR },
      };
      this.fullText = richCharsToTaggedText(chars);
      this.applyLayout(layout);
      this.wrappedLines = revealing ? this.wrapMessage(chars) : null;
    }
    // 2791 AVGTypeWriterText._BeginRevealOrDefer lays out the entire
    // message before the first quad. Freeze Pixi's full-text line breaks
    // while the transparent suffix changes the paint runs.
    dialogue.style.wordWrap = !revealing || this.wrappedLines === null;
    dialogue.text = revealing
      ? (this.wrappedLines
          ?.map(({ chars: line, startIndex }) =>
            richCharsToTaggedText(line, visibleCount - startIndex),
          )
          .join("\n") ?? richCharsToTaggedText(chars, visibleCount))
      : this.fullText;
    this.setHidden(false);
  }

  private wrapMessage(chars: TypewriterText["chars"]): DialogueLine[] | null {
    const dialogue = this.dialogue;
    if (!dialogue) return null;
    const { lines } = CanvasTextMetrics.measureText(
      this.fullText,
      dialogue.style,
      undefined,
      true,
    );
    // WhiteSpace is "pre". Pixi may trim wrap spaces and CR/LF, so map
    // each displayed line back to its position in the original text.
    const plain = chars.map(({ char }) => char).join("");
    const wrapped: DialogueLine[] = [];
    let offset = 0;
    let charIndex = 0;
    for (const line of lines) {
      const start = plain.indexOf(line, offset);
      if (start < 0) return null;
      const startIndex =
        charIndex + Array.from(plain.slice(offset, start)).length;
      charIndex = startIndex + Array.from(line).length;
      offset = start + line.length;
      wrapped.push({ chars: chars.slice(startIndex, charIndex), startIndex });
    }
    return wrapped;
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
    this.dialogue.style.wordWrapWidth = DialogView.MESSAGE_WIDTH;
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
      DialogView.HIDE_FADE_MS,
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
    return CanvasTextMetrics.measureText(
      text,
      this.dialogue.style,
      undefined,
      true,
    ).height;
  }

  private applyNameBestFit(name: string): void {
    if (!this.speaker) return;
    for (
      let size = DialogView.NAME_FONT_MAX;
      size >= DialogView.NAME_FONT_MIN;
      size -= 1
    ) {
      this.speaker.style.fontSize = size;
      if (
        !name ||
        CanvasTextMetrics.measureText(name, this.speaker.style).width <=
          DialogView.NAME_WIDTH
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
        STORY_WIDTH * DialogView.MESSAGE_ANCHOR_X +
        (layout.executor === "aside"
          ? DialogView.MESSAGE_ASIDE_LEFT
          : DialogView.MESSAGE_LEFT);
      let height = this.measureMessage(layout.text);
      // Native port: `_TryExpandMessageWidthOnOverflow`. Once the content
      // reaches the max height (warnDelta = height - 89 >= 0), widen the
      // message by one character (`_GetSingleCharacterWidth` = fontSize) for
      // the rest of the command and measure again. Only one widening per
      // command; `restoreMessageWidth` undoes it. `_ExecuteEndtip` skips it.
      if (
        layout.executor !== "endtip" &&
        height - DialogView.MESSAGE_MAX_HEIGHT >= 0 &&
        !this.messageWidthExpanded
      ) {
        this.dialogue.style.wordWrapWidth =
          DialogView.MESSAGE_WIDTH + this.dialogue.style.fontSize;
        this.messageWidthExpanded = true;
        height = this.measureMessage(layout.text);
      }
      this.dialogue.y =
        STORY_HEIGHT -
        DialogView.MESSAGE_TOP -
        Math.max(0, height - DialogView.MESSAGE_MAX_HEIGHT);
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
        DialogView.BOTTOM_HEIGHT +
        DialogView.NAME_TOP -
        Math.max(0, height - DialogView.NAME_MAX_HEIGHT);
    }
  }
}
