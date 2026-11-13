import { Graphics, Sprite, type Texture } from "pixi.js";

import {
  exactArg,
  roundHalfToEven,
  toString,
  tryParseInt32,
} from "../../commandParams";
import { parseShowItemFadeStyle, ShowItemFadeStyle } from "../../showitem";
import { STORY_HEIGHT, type StoryCommandArgs } from "../../types";

import { ShowItemSlot, type ShowItemAnimation } from "./ShowItemSlot";

/** GetInt @ 0x186941320 converts the boxed parameter via Convert.ToInt32. */
function readWidth(args: StoryCommandArgs): number | undefined {
  const value = exactArg(args, "width");
  if (value === undefined) return undefined;
  const width =
    typeof value === "string"
      ? tryParseInt32(value)
      : roundHalfToEven(Number(value));
  if (
    width === null ||
    !Number.isInteger(width) ||
    width < -2_147_483_648 ||
    width > 2_147_483_647
  )
    throw new RangeError(
      `Invalid showitem width ${JSON.stringify(value)}. Expected an Int32.`,
    );
  return width;
}

/** AVGShowItemCutinSlot (2791 Show @ 0x184244230, Hide @ 0x184243FE0). */
export class ShowItemCutinSlot extends ShowItemSlot {
  private readonly mask = new Graphics();
  private readonly plate = new Graphics();
  private header: Sprite | null = null;
  private fadeStyle = ShowItemFadeStyle.fade;
  private width: number | undefined;
  private maskWidth = 0;
  private maskHeight = 0;

  protected prepareShow(args: StoryCommandArgs): ShowItemAnimation {
    this.fadeStyle = parseShowItemFadeStyle(
      toString(exactArg(args, "fadestyle")),
    );
    this.width = readWidth(args);
    this.content.addChildAt(this.plate, 0);
    this.root.addChildAt(this.mask, 1);
    this.content.mask = this.mask;
    this.drawInitialWindow();

    if (this.fadeStyle === ShowItemFadeStyle.fade) {
      this.root.alpha = 0;
      return { step: this.fadeIn };
    }

    // Only the mask's DOSizeDelta has SetIgnoreTimeScale and OnComplete.
    const blackAlpha = this.backdropAlpha;
    const horizontal = this.horizontal;
    this.root.alpha = 1;
    this.backdropAlpha = 0;
    return {
      backdropStep: (progress) => {
        this.backdropAlpha = blackAlpha * progress;
      },
      step: (progress) =>
        this.drawWindow(
          horizontal ? this.targetWidth * progress : this.targetWidth,
          horizontal ? STORY_HEIGHT : STORY_HEIGHT * progress,
        ),
    };
  }

  protected prepareHide(): ShowItemAnimation {
    if (this.fadeStyle === ShowItemFadeStyle.fade)
      return { step: this.fadeOut() };

    const horizontal = this.horizontal;
    // DOSizeDelta and DOFade each sample their start on their first update.
    let fromAlpha: number | undefined;
    let fromWidth: number | undefined;
    let fromHeight: number | undefined;
    return {
      backdropStep: (progress) => {
        fromAlpha ??= this.backdropAlpha;
        this.backdropAlpha = fromAlpha * (1 - progress);
      },
      step: (progress) => {
        fromWidth ??= this.maskWidth;
        fromHeight ??= this.maskHeight;
        const remaining = 1 - progress;
        this.drawWindow(
          horizontal ? fromWidth * remaining : fromWidth,
          horizontal ? fromHeight : fromHeight * remaining,
        );
      },
    };
  }

  protected override setImage(texture: Texture): void {
    super.setImage(texture);
    this.drawInitialWindow();
  }

  protected setDecoration(texture: Texture): void {
    // The upside-down header is 200px tall, with 50px above the mask.
    const header = new Sprite(texture);
    header.anchor.set(0.5, 1);
    header.rotation = Math.PI;
    header.tint = 0x00_00_00;
    header.alpha = 0.706;
    header.height = 200;
    this.content.addChildAt(header, 1);
    this.header = header;
    this.drawWindow(this.maskWidth, this.maskHeight);
  }

  private get targetWidth(): number {
    return this.width ?? Math.trunc(this.image.width);
  }

  private get horizontal(): boolean {
    return (
      this.fadeStyle >= ShowItemFadeStyle.horiz_expand_center &&
      this.fadeStyle <= ShowItemFadeStyle.horiz_expand_right2left
    );
  }

  private drawInitialWindow(): void {
    const horizontal = this.horizontal;
    this.drawWindow(
      horizontal ? 0 : this.targetWidth,
      horizontal || this.fadeStyle === ShowItemFadeStyle.fade
        ? STORY_HEIGHT
        : 0,
    );
  }

  private drawWindow(width: number, height: number): void {
    this.maskWidth = width;
    this.maskHeight = height;
    // Clipping.FindCullAndClipWorldRect @ 0x186E764B0 rejects empty and
    // inverted rectangles. The backdrop sits outside the clipped subtree.
    this.content.renderable = width > 0 && height > 0;
    let x: number;
    switch (this.fadeStyle) {
      case ShowItemFadeStyle.horiz_expand_left2right:
        x = -Math.trunc(this.targetWidth / 2);
        break;
      case ShowItemFadeStyle.horiz_expand_right2left:
        x = Math.trunc(this.targetWidth / 2) - width;
        break;
      default:
        x = -width / 2;
        break;
    }
    let y: number;
    switch (this.fadeStyle) {
      case ShowItemFadeStyle.vert_expand_top2bottom:
        y = -STORY_HEIGHT / 2;
        break;
      case ShowItemFadeStyle.vert_expand_bottom2top:
        y = STORY_HEIGHT / 2 - height;
        break;
      default:
        y = -height / 2;
        break;
    }
    this.mask
      .clear()
      .rect(this.content.x + x, this.content.y + y, width, height)
      .fill(0xff_ff_ff);
    this.plate.clear().rect(x, y, width, height).fill(0x31_31_31);
    if (this.header) {
      this.header.position.set(x + width / 2, y - 50);
      this.header.width = width;
    }
  }
}
