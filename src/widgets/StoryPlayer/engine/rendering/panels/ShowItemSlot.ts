import { Container, Graphics, Sprite, Texture } from "pixi.js";

import { exactArg, toNumber } from "../../commandParams";
import {
  STORY_HEIGHT,
  STORY_WIDTH,
  type StoryCommandArgs,
  type StoryShowItemSlot,
} from "../../types";
import { dotweenDefaultEase } from "../core/DotweenEase";

import type { TweenRunner } from "../core/TweenRunner";

export interface ShowItemSlotHost {
  layer: Container;
  loadImage: (key: string) => Promise<Texture | null>;
  loadDecoration: () => Promise<Texture | null>;
  tween: TweenRunner["run"];
}

function readFadeMs(args: StoryCommandArgs): number {
  const value = exactArg(args, "fadetime");
  return Math.max(
    0,
    Math.round((value === null ? 0 : toNumber(value, 0.5)) * 1000),
  );
}

/**
 * Torappu.AVG.AVGShowItemSlot (2791 Show @ 0x184245400, Hide @ 0x184245270).
 * A slot owns its canvas group, sprite and current animation end callback.
 */
export abstract class ShowItemSlot implements StoryShowItemSlot {
  protected readonly root = new Container();
  protected readonly backdrop = new Graphics()
    .rect(0, 0, STORY_WIDTH, STORY_HEIGHT)
    .fill(0x00_00_00);
  protected readonly content = new Container();
  protected readonly image = new Sprite(Texture.WHITE);
  private onAnimEnd: (() => void) | null = null;
  private showing = false;

  constructor(private readonly host: ShowItemSlotHost) {
    // A sprite-less Unity Image still draws its serialized 100x100 white quad.
    this.image.anchor.set(0.5);
    this.image.setSize(100, 100);
    this.content.addChild(this.image);
    this.root.addChild(this.backdrop, this.content);
  }

  async show(
    args: StoryCommandArgs,
    key: string | null,
    onEnd: () => void,
  ): Promise<void> {
    this.onAnimEnd = onEnd;
    this.showing = true;
    // Both prefab transforms use Unity's upward Y axis.
    this.content.position.set(
      STORY_WIDTH / 2 + toNumber(exactArg(args, "offsetx")),
      STORY_HEIGHT / 2 - toNumber(exactArg(args, "offsety")),
    );
    const blackArg = exactArg(args, "black");
    const black = blackArg === null ? 0 : toNumber(blackArg, 0.4);
    this.backdrop.alpha = Math.max(0, Math.min(1, black));
    const step = this.prepareShow(args);
    // The native prefab exists before the synchronous sprite load. On Web,
    // Hide can animate the placeholder while the texture request is pending.
    this.host.layer.addChild(this.root);

    const texture = key ? await this.host.loadImage(key) : null;
    if (!this.showing) return;
    if (texture) this.setImage(texture);
    const decoration = await this.host.loadDecoration();
    if (!this.showing) return;
    if (decoration) this.setDecoration(decoration);

    this.animate(readFadeMs(args), step);
  }

  hide(args: StoryCommandArgs, onEnd: () => void): void {
    this.showing = false;
    this.onAnimEnd = onEnd;
    const fadeMs = readFadeMs(args);
    if (!this.root.parent || fadeMs <= 0) {
      this.finishAnimation();
      return;
    }
    this.animate(fadeMs, this.prepareHide());
  }

  destroy(): void {
    this.showing = false;
    this.onAnimEnd = null;
    if (!this.root.destroyed) this.root.destroy({ children: true });
  }

  protected abstract prepareShow(
    args: StoryCommandArgs,
  ): (progress: number) => void;

  protected abstract prepareHide(): (progress: number) => void;

  protected abstract setDecoration(texture: Texture): void;

  protected setImage(texture: Texture): void {
    this.image.texture = texture;
    this.image.setSize(texture.width, texture.height);
  }

  protected fadeIn = (progress: number): void => {
    this.root.alpha = progress;
  };

  protected fadeOut(): (progress: number) => void {
    // DOTween reads the getter in DoStartup @ 0x1847E69D0. An older Show
    // can update the canvas group earlier in the same frame.
    let from: number | undefined;
    return (progress) => {
      from ??= this.root.alpha;
      this.root.alpha = from * (1 - progress);
    };
  }

  private animate(durationMs: number, step: (progress: number) => void): void {
    if (durationMs <= 0) {
      step(1);
      this.finishAnimation();
      return;
    }
    void this.host.tween(
      durationMs,
      step,
      () => {
        if (this.root.parent === this.host.layer) this.finishAnimation();
      },
      {
        ease: dotweenDefaultEase,
        isAlive: () => this.root.parent === this.host.layer,
      },
    );
  }

  /** OnAnimEnd @ 0x184245310 invokes the slot's current callback once. */
  private finishAnimation(): void {
    const finish = this.onAnimEnd;
    this.onAnimEnd = null;
    finish?.();
  }
}
