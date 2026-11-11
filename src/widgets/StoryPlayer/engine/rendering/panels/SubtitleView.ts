import { Text, type Container, type TextStyle } from "pixi.js";

import {
  buildTagStyles,
  colorTagName,
  HIDDEN_TEXT_COLOR,
  richCharsToTaggedText,
} from "../../richtext";

import type { OverlayTextLayout, TypewriterText } from "../../types";
import type { TweenRunner } from "../core/TweenRunner";

interface SubtitleViewHost {
  createTextStyle: (fontSize: number, width: number) => TextStyle;
  layoutText: (
    text: Text,
    x: number,
    width: number,
    alignment: OverlayTextLayout["alignment"],
  ) => void;
  tween: TweenRunner["run"];
}

/** Pixi adapter for SubtitlePanel's Text, RectTransform and CanvasGroup. */
export class SubtitleView {
  private text: Text | null = null;
  private layout: OverlayTextLayout | null = null;
  private hidden = true;
  private fadeGeneration = 0;

  constructor(
    private readonly layer: Container,
    private readonly host: SubtitleViewHost,
  ) {}

  mount(): void {
    const text = new Text({
      style: this.host.createTextStyle(18, 675),
      text: "",
    });
    text.alpha = 0;
    text.visible = false;
    this.layer.addChild(text);
    this.text = text;
  }

  render(
    { chars, visibleCount }: TypewriterText,
    layout?: OverlayTextLayout,
  ): void {
    const text = this.text;
    if (!text) return;

    if (layout) {
      this.layout = layout;
      const style = this.host.createTextStyle(layout.sizePx, layout.widthPx);
      // TextAnchor aligns each wrapped line. layoutText places the whole block.
      style.align = layout.alignment;
      style.tagStyles = {
        ...buildTagStyles(chars),
        // Pixi's tagged text shadow pass ignores transparent fill.
        [colorTagName(HIDDEN_TEXT_COLOR)]: {
          dropShadow: false,
          fill: HIDDEN_TEXT_COLOR,
        },
      };
      text.style = style;
      text.y = layout.y;
    }
    if (!this.layout) return;

    // Keep unrevealed characters in the layout, including their font styles.
    text.text = richCharsToTaggedText(chars, visibleCount);
    const { x, widthPx, alignment } = this.layout;
    this.host.layoutText(text, x, widthPx, alignment);
    void this.setHidden(false, 150);
  }

  clear(fadeMs = 0): Promise<void> | void {
    return this.setHidden(true, fadeMs);
  }

  destroy(): void {
    this.fadeGeneration += 1;
    this.text = null;
    this.layout = null;
    this.hidden = true;
  }

  /**
   * Native _SetHiddenInternal (2791 @ 0x1841E5B70): visibility changes fade
   * from the current alpha. Consecutive subtitles keep the fade already in
   * progress. OnReset forces the hidden state immediately.
   */
  private setHidden(hidden: boolean, fadeMs: number): Promise<void> | void {
    const text = this.text;
    if (!text || (this.hidden === hidden && fadeMs > 0)) return;

    this.hidden = hidden;
    const generation = ++this.fadeGeneration;
    const from = text.alpha;
    const target = hidden ? 0 : 1;
    const isCurrent = () => generation === this.fadeGeneration;
    const complete = () => {
      if (!isCurrent() || !hidden) return;
      text.visible = false;
      text.text = "";
      this.layout = null;
    };
    if (!hidden) text.visible = true;
    if (fadeMs <= 0) {
      text.alpha = target;
      complete();
      return;
    }

    return this.host.tween(
      fadeMs,
      (progress) => {
        if (isCurrent()) text.alpha = from + (target - from) * progress;
      },
      complete,
      { isAlive: isCurrent },
    );
  }
}
