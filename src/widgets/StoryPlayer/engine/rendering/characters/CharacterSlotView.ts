import { Container, Sprite, Texture } from "pixi.js";

import type { CharacterArt } from "./CharacterArt";

interface ImageHolder {
  readonly sprite: Sprite;
  release?: () => void;
}

interface OutgoingImage {
  update: (progress: number) => void;
  finish: () => void;
}

function imageHolder(): ImageHolder {
  const sprite = new Sprite();
  sprite.anchor.set(0.5);
  sprite.visible = false;
  const holder: ImageHolder = { sprite };
  sprite.once("destroyed", () => holder.release?.());
  return holder;
}

function clearImage(holder: ImageHolder): void {
  holder.sprite.visible = false;
  holder.sprite.texture = Texture.EMPTY;
  holder.release?.();
  holder.release = undefined;
}

/**
 * Torappu.AVG.AVGCharacterSlot._SwapImages / _SlotSetCharInternal (2791
 * @ 0x18423A040). The front and back holders swap roles. Each keeps its own
 * hub rect and texture while fading. The host supplies the slot anchor and
 * schedules the front fade on its own command timeline.
 */
export class CharacterSlotView {
  readonly root = new Container();
  readonly offset = new Container();
  private front = imageHolder();
  private back = imageHolder();
  private swapId = 0;

  constructor(parent: Container, x: number, y: number) {
    this.root.position.set(x, y);
    this.root.addChild(this.offset);
    this.offset.addChild(this.back.sprite, this.front.sprite);
    parent.addChild(this.root);
  }

  clear(): void {
    this.swapId += 1;
    clearImage(this.front);
    clearImage(this.back);
  }

  swap(
    art: CharacterArt | null,
    alpha: number,
  ): {
    front: Sprite | null;
    isAlive: () => boolean;
    outgoing?: OutgoingImage;
  } {
    const incoming = this.back;
    const previous = this.front;
    const texture = art?.acquire();
    clearImage(incoming);
    this.front = incoming;
    this.back = previous;
    this.offset.setChildIndex(incoming.sprite, 1);
    if (art && texture) {
      const { sprite } = incoming;
      sprite.texture = texture.texture;
      incoming.release = texture.release;
      sprite.position.set(art.pos.x, -art.pos.y);
      sprite.scale.set(
        art.width / Math.max(1, sprite.texture.width),
        art.height / Math.max(1, sprite.texture.height),
      );
      sprite.alpha = alpha;
      sprite.visible = true;
    }

    const id = ++this.swapId;
    const isAlive = () => this.swapId === id && !this.offset.destroyed;
    const front = incoming.sprite.visible ? incoming.sprite : null;
    if (!previous.sprite.visible) return { front, isAlive };

    let alphaFrom: number | undefined;
    return {
      front,
      isAlive,
      outgoing: {
        update: (progress) => {
          if (!isAlive()) return;
          alphaFrom ??= previous.sprite.alpha;
          previous.sprite.alpha = alphaFrom * (1 - progress);
        },
        finish: () => {
          if (isAlive()) clearImage(previous);
        },
      },
    };
  }
}
