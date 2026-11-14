import { Container, Graphics, Sprite, Texture } from "pixi.js";

import { exactArg, toNumber } from "../../commandParams";
import {
  STORY_HEIGHT,
  STORY_WIDTH,
  type StoryCommandArgs,
  type StoryShowItemSlot,
} from "../../types";
import { dotweenDefaultEase } from "../core/DotweenEase";

import type { TextureLoad } from "../core/TextureAsset";
import type { TweenRunner, TweenRunOptions } from "../core/TweenRunner";

export interface ShowItemSlotHost {
  layer: Container;
  loadImage: (key: string) => TextureLoad;
  loadDecoration: () => TextureLoad;
  tween: TweenRunner["run"];
}

export interface ShowItemAnimation {
  backdropStep?: (progress: number) => void;
  step: (progress: number) => void;
}

// Unity TimeManager in 2791 caps scaled deltaTime at one third of a second.
const MAX_SCALED_FRAME_DELTA_MS = 1000 / 3;

function readFadeMs(args: StoryCommandArgs): number {
  const value = exactArg(args, "fadetime");
  return Math.max(0, (value === null ? 0 : toNumber(value, 0.5)) * 1000);
}

/**
 * Torappu.AVG.AVGShowItemSlot (2791 Show @ 0x184245400, Hide @ 0x184245270).
 * A slot owns its canvas group, sprite and current animation end callback.
 */
export abstract class ShowItemSlot implements StoryShowItemSlot {
  protected readonly root = new Container();
  private readonly backdrop = new Graphics()
    .rect(0, 0, STORY_WIDTH, STORY_HEIGHT)
    .fill(0x00_00_00);
  protected readonly content = new Container();
  protected readonly image = new Sprite(Texture.WHITE);
  private backdropColorAlpha = 0;
  private onAnimEnd: (() => void) | null = null;
  private showing = false;

  constructor(private readonly host: ShowItemSlotHost) {
    // A sprite-less Unity Image still draws its serialized 100x100 white quad.
    this.image.anchor.set(0.5);
    this.image.setSize(100, 100);
    this.content.addChild(this.image);
    this.root.addChild(this.backdrop, this.content);
  }

  show(
    args: StoryCommandArgs,
    key: string | null,
    onEnd: () => void,
  ): Promise<void> | void {
    this.onAnimEnd = onEnd;
    this.showing = true;
    // Both prefab transforms use Unity's upward Y axis.
    this.content.position.set(
      STORY_WIDTH / 2 + toNumber(exactArg(args, "offsetx")),
      STORY_HEIGHT / 2 - toNumber(exactArg(args, "offsety")),
    );
    const blackArg = exactArg(args, "black");
    const black = blackArg === null ? 0 : toNumber(blackArg, 0.4);
    this.backdropAlpha = black;
    const animation = this.prepareShow(args);
    // The native prefab exists before the synchronous sprite load. On Web,
    // Hide can animate the placeholder while the texture request is pending.
    this.host.layer.addChild(this.root);

    const draw = (texture: Texture | null, decoration: Texture | null) => {
      if (!this.showing || this.root.parent !== this.host.layer) return;
      if (texture) this.setImage(texture);
      if (decoration) this.setDecoration(decoration);
      this.animate(readFadeMs(args), animation);
    };
    const texture = key ? this.host.loadImage(key) : null;
    const decoration = this.host.loadDecoration();
    if (texture instanceof Promise || decoration instanceof Promise) {
      return Promise.all([texture, decoration]).then(
        ([art, frame]) => draw(art, frame),
        (error) => {
          // Hide may take over while Web assets are still pending.
          if (this.showing) throw error;
        },
      );
    }
    draw(texture, decoration);
  }

  hide(args: StoryCommandArgs, onEnd: () => void): void {
    this.showing = false;
    this.onAnimEnd = onEnd;
    const fadeMs = readFadeMs(args);
    if (!this.root.parent) {
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

  protected abstract prepareShow(args: StoryCommandArgs): ShowItemAnimation;

  protected abstract prepareHide(): ShowItemAnimation;

  protected abstract setDecoration(texture: Texture): void;

  protected setImage(texture: Texture): void {
    this.image.texture = texture;
    this.image.setSize(texture.width, texture.height);
  }

  protected get backdropAlpha(): number {
    return this.backdropColorAlpha;
  }

  protected set backdropAlpha(value: number) {
    // DOTween ColorPlugin @ 0x18444A560 interpolates the raw Graphic.color
    // alpha. Unity clamps it when packing Color32 for the UI vertex.
    this.backdropColorAlpha = value;
    this.backdrop.alpha = Math.max(0, Math.min(1, value));
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

  private animate(
    durationMs: number,
    { backdropStep, step }: ShowItemAnimation,
  ): void {
    const isAlive = () => this.root.parent === this.host.layer;
    const options: TweenRunOptions = {
      // 2791 TweenManager.Update @ 0x1844679F0 completes duration 0 on update.
      deferZeroDuration: true,
      ease: dotweenDefaultEase,
      isAlive,
    };
    void this.host.tween(
      durationMs,
      step,
      () => {
        if (isAlive()) this.finishAnimation();
      },
      options,
    );
    if (backdropStep) {
      // Cutin's separate Graphic.DOFade uses scaled deltaTime. Web playback
      // runs at Unity's default timeScale 1.
      void this.host.tween(durationMs, backdropStep, undefined, {
        ...options,
        maxFrameDeltaMs: MAX_SCALED_FRAME_DELTA_MS,
      });
    }
  }

  /** OnAnimEnd @ 0x184245310 invokes the slot's current callback once. */
  private finishAnimation(): void {
    const finish = this.onAnimEnd;
    this.onAnimEnd = null;
    finish?.();
  }
}
