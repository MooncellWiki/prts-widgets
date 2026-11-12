import { NineSliceSprite, type Texture } from "pixi.js";

import { computeShowItemLayout, SHOWITEM_FRAME_BORDER } from "../../showitem";

import { ShowItemSlot } from "./ShowItemSlot";

/** AVGShowItemPhotoSlot (2791 Show @ 0x184244D10, Hide @ 0x184244B60). */
export class ShowItemPhotoSlot extends ShowItemSlot {
  protected prepareShow(): (progress: number) => void {
    this.root.alpha = 0;
    return this.fadeIn;
  }

  protected prepareHide(): (progress: number) => void {
    this.root.alpha = 1;
    return this.fadeOut();
  }

  protected setDecoration(texture: Texture): void {
    // UICustomAnchor fits the prefab's nine-slice frame around image_item.
    const layout = computeShowItemLayout(this.image.width, this.image.height);
    const frame = new NineSliceSprite({
      bottomHeight: SHOWITEM_FRAME_BORDER,
      leftWidth: SHOWITEM_FRAME_BORDER,
      rightWidth: SHOWITEM_FRAME_BORDER,
      texture,
      topHeight: SHOWITEM_FRAME_BORDER,
    });
    frame.anchor.set(0.5);
    frame.width = layout.frameWidth;
    frame.height = layout.frameHeight;
    this.content.addChildAt(frame, 0);
  }
}
