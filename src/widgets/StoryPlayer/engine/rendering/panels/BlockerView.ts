import { Assets, Sprite, Texture, type Container } from "pixi.js";

import { SLIDE_MASK_TEXTURE_URL } from "../../../assets";
import { resolveStoryAssetByKey } from "../../asset";
import { createExecutionHandle, type ExecutionHandle } from "../../execution";
import { STORY_HEIGHT, STORY_WIDTH, type BlockerInput } from "../../types";
import { dotweenDefaultEase } from "../core/DotweenEase";
import { SlideMaskFilter } from "../core/SlideMaskFilter";
import { getCachedTexture } from "../core/TextureAsset";

import type { TweenRunner } from "../core/TweenRunner";

const CLEAR_COLOR = { a: 0, b: 0, g: 0, r: 0 };

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function tintChannel(value: number): number {
  return Math.round(clamp01(value) * 255);
}

/** Torappu.AVG.AVGBlockerPanel's full-screen Image and DOColor tween. */
export class BlockerView {
  private sprite?: Sprite;
  private color = CLEAR_COLOR;
  private readonly scaleSign = { x: 1, y: 1 };
  private slideMaterial?: SlideMaskFilter;
  private slideFilter?: SlideMaskFilter;
  private maskLoadFailed = false;
  private preparation?: ExecutionHandle;

  constructor(
    private readonly layer: Container,
    private readonly tweens: TweenRunner,
    private readonly onWarning?: (detail: string) => void,
  ) {}

  show(input: BlockerInput, onComplete?: () => void): ExecutionHandle | void {
    this.cancelPreparation();
    const url = this.textureUrl(input);
    const cached = url ? getCachedTexture(url) : undefined;
    if (!url || cached) return this.apply(input, cached, onComplete);

    // _ChangeBlockerImg and _SetMaterial load synchronously in 2791. On a
    // Web cache miss, leave the mounted blocker running until art is ready.
    const animation = createExecutionHandle(true);
    this.preparation = animation;
    const assetsReady = Assets.load<Texture>(url)
      .catch((): undefined => {
        if (this.preparation !== animation) return undefined;
        if (input.style === "default") {
          this.onWarning?.(`missing blocker image: ${input.image}`);
        } else {
          this.maskLoadFailed = true;
          this.onWarning?.("missing blocker slide mask texture");
        }
        return undefined;
      })
      .then((texture) => {
        if (this.preparation !== animation) return;
        this.preparation = undefined;
        if (!this.apply(input, texture, onComplete, animation)) animation.end();
      })
      .catch((error: unknown) => {
        if (this.preparation === animation) this.preparation = undefined;
        animation.fail(error);
      });
    return Object.assign(animation, { assetsReady });
  }

  cancelPreparation(): void {
    this.preparation?.end("force_end");
    this.preparation = undefined;
  }

  /** OnReset (2791 @ 0x184184380) restores the prefab color, material and scale. */
  reset(): void {
    this.preparation?.end("reset");
    this.preparation = undefined;
    if (this.sprite) {
      this.tweens.killTarget(this.sprite);
      this.sprite.destroy();
      this.sprite = undefined;
    }
    this.slideMaterial?.destroy();
    this.slideMaterial = undefined;
    this.slideFilter = undefined;
    this.maskLoadFailed = false;
    this.scaleSign.x = 1;
    this.scaleSign.y = 1;
    this.color = CLEAR_COLOR;
  }

  private textureUrl(input: BlockerInput): string | null {
    if (input.style === "default")
      return resolveStoryAssetByKey(input.image ?? "", "image");
    return input.fadeMs > 0 && !this.slideMaterial && !this.maskLoadFailed
      ? SLIDE_MASK_TEXTURE_URL
      : null;
  }

  private apply(
    input: BlockerInput,
    texture: Texture | undefined,
    onComplete?: () => void,
    preparation?: ExecutionHandle,
  ): ExecutionHandle | void {
    const sprite = this.ensureSprite();
    // _ExecuteBlocker (2791 @ 0x184184890) switches art before updating color.
    // Texture.WHITE stands in for the null-sprite quad of the wipe styles.
    if (input.style !== "default") this.setTexture(sprite, Texture.WHITE);
    else if (texture) this.setTexture(sprite, texture);

    // Omitted from channels inherit the raw Unity Color, including values
    // above 1. Clamp only the tint and alpha written to Pixi.
    const current = this.color;
    const from = {
      a: Number.isFinite(input.from.a) ? input.from.a : current.a,
      b: Number.isFinite(input.from.b) ? input.from.b : current.b,
      g: Number.isFinite(input.from.g) ? input.from.g : current.g,
      r: Number.isFinite(input.from.r) ? input.from.r : current.r,
    };
    this.tweens.killTarget(sprite); // DOKill(_blocker, complete: false)
    if (input.fadeMs <= 0) {
      // The instant branch retains the previous material and scale.
      this.writeColor(sprite, input.to);
      return;
    }

    // Inverse writes a persistent literal -1 on the selected axis.
    if (input.inverse) {
      if (input.style === "slider") this.scaleSign.x = -1;
      else if (input.style === "verticalslider") this.scaleSign.y = -1;
    }
    this.setMaterial(sprite, input.style, texture);
    this.writeColor(sprite, from);

    // _GenTweenerWithParam (2791 @ 0x1841851C0) uses DOColor with the
    // default ease and ignores timeScale. _FinishCommand is OnComplete.
    const animation = input.block
      ? (preparation ?? createExecutionHandle(true))
      : undefined;
    this.tweens.start(
      input.fadeMs,
      (progress) => {
        this.writeColor(sprite, {
          a: from.a + (input.to.a - from.a) * progress,
          b: from.b + (input.to.b - from.b) * progress,
          g: from.g + (input.to.g - from.g) * progress,
          r: from.r + (input.to.r - from.r) * progress,
        });
      },
      {
        ease: dotweenDefaultEase,
        onCancel: () => animation?.end("reset"),
        onComplete: () => {
          // _FinishCommand (2791 @ 0x1841850A0) hides a near-transparent
          // blocker and restores the serialized default Image sprite.
          if (Math.abs(Math.fround(input.to.a)) <= Math.fround(1e-5)) {
            this.setTexture(sprite, Texture.WHITE);
            sprite.visible = false;
          }
          animation?.end();
          // A previous DOColor may finish while its replacement loads art.
          if (!this.preparation) onComplete?.();
        },
        target: sprite,
      },
    );
    return animation;
  }

  private ensureSprite(): Sprite {
    if (this.sprite) return this.sprite;
    const sprite = new Sprite(Texture.WHITE);
    sprite.anchor.set(0.5);
    sprite.position.set(STORY_WIDTH / 2, STORY_HEIGHT / 2);
    sprite.visible = false;
    this.setTexture(sprite, Texture.WHITE);
    this.layer.addChild(sprite);
    this.sprite = sprite;
    return sprite;
  }

  private setTexture(sprite: Sprite, texture: Texture): void {
    sprite.texture = texture;
    sprite.width = STORY_WIDTH;
    sprite.height = STORY_HEIGHT;
    this.applyScaleSign(sprite);
  }

  private applyScaleSign(sprite: Sprite): void {
    sprite.scale.x = this.scaleSign.x * Math.abs(sprite.scale.x);
    sprite.scale.y = this.scaleSign.y * Math.abs(sprite.scale.y);
    this.slideFilter?.setFlip(this.scaleSign.x < 0, this.scaleSign.y < 0);
  }

  /** _GenTweenerWithParam mounts slide_mask or clears the material. */
  private setMaterial(
    sprite: Sprite,
    style: BlockerInput["style"],
    mask?: Texture,
  ): void {
    if (style !== "default" && mask)
      this.slideMaterial ??= new SlideMaskFilter(mask.source);
    this.slideFilter = style === "default" ? undefined : this.slideMaterial;
    this.slideFilter?.setVertical(style === "verticalslider");
    this.applyScaleSign(sprite);
    sprite.filters = this.slideFilter ? [this.slideFilter] : [];
  }

  private writeColor(sprite: Sprite, color: BlockerInput["to"]): void {
    this.color = { ...color };
    sprite.tint =
      (tintChannel(color.r) << 16) |
      (tintChannel(color.g) << 8) |
      tintChannel(color.b);
    if (this.slideFilter) {
      this.slideFilter.alpha = color.a;
      sprite.alpha = 1;
    } else {
      sprite.alpha = clamp01(color.a);
    }
    sprite.visible = color.a > 0;
  }
}
