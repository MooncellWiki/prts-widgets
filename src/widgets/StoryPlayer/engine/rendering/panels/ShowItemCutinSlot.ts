import { Graphics, Sprite, type Texture } from "pixi.js";

import {
  exactArg,
  roundHalfToEven,
  toNumber,
  toString,
} from "../../commandParams";
import { parseShowItemFadeStyle } from "../../showitem";
import {
  STORY_HEIGHT,
  type ShowItemFadeStyle,
  type StoryCommandArgs,
} from "../../types";

import { ShowItemSlot } from "./ShowItemSlot";

/** AVGShowItemCutinSlot (2791 Show @ 0x184244230, Hide @ 0x184243FE0). */
export class ShowItemCutinSlot extends ShowItemSlot {
  private readonly mask = new Graphics();
  private readonly plate = new Graphics();
  private header: Sprite | null = null;
  private fadeStyle: ShowItemFadeStyle = "fade";
  private targetWidth = 0;
  private maskWidth = 0;
  private maskHeight = 0;

  protected prepareShow(
    args: StoryCommandArgs,
    decoration: Texture | null,
  ): (progress: number) => void {
    this.fadeStyle =
      parseShowItemFadeStyle(toString(exactArg(args, "fadestyle"))) ?? "fade";
    const width = toNumber(exactArg(args, "width"), Number.NaN);
    this.targetWidth = Number.isFinite(width)
      ? roundHalfToEven(width)
      : this.image.width;
    this.content.addChildAt(this.plate, 0);
    this.root.addChildAt(this.mask, 1);
    this.content.mask = this.mask;
    if (decoration) {
      // The upside-down header is 200px tall, with 50px above the mask.
      const header = new Sprite(decoration);
      header.anchor.set(0.5, 1);
      header.rotation = Math.PI;
      header.tint = 0x00_00_00;
      header.alpha = 0.706;
      header.height = 200;
      this.content.addChildAt(header, 1);
      this.header = header;
    }

    if (this.fadeStyle === "fade") {
      this.root.alpha = 0;
      this.drawWindow(this.targetWidth, STORY_HEIGHT);
      return this.fadeIn;
    }

    // Native runs DOSizeDelta and DOFade in parallel with the same duration.
    const blackAlpha = this.backdrop.alpha;
    const horizontal = this.fadeStyle.startsWith("horiz");
    this.root.alpha = 1;
    const expand = (progress: number) => {
      this.backdrop.alpha = blackAlpha * progress;
      this.drawWindow(
        horizontal ? this.targetWidth * progress : this.targetWidth,
        horizontal ? STORY_HEIGHT : STORY_HEIGHT * progress,
      );
    };
    expand(0);
    return expand;
  }

  protected prepareHide(): (progress: number) => void {
    if (this.fadeStyle === "fade") return this.fadeOut();

    const horizontal = this.fadeStyle.startsWith("horiz");
    const width = this.maskWidth;
    const height = this.maskHeight;
    const blackAlpha = this.backdrop.alpha;
    return (progress) => {
      const remaining = 1 - progress;
      this.backdrop.alpha = blackAlpha * remaining;
      this.drawWindow(
        horizontal ? width * remaining : width,
        horizontal ? height : height * remaining,
      );
    };
  }

  private drawWindow(width: number, height: number): void {
    this.maskWidth = width;
    this.maskHeight = height;
    let x: number;
    switch (this.fadeStyle) {
      case "horiz_expand_left2right":
        x = -this.targetWidth / 2;
        break;
      case "horiz_expand_right2left":
        x = this.targetWidth / 2 - width;
        break;
      default:
        x = -width / 2;
        break;
    }
    let y: number;
    switch (this.fadeStyle) {
      case "vert_expand_top2bottom":
        y = -STORY_HEIGHT / 2;
        break;
      case "vert_expand_bottom2top":
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
