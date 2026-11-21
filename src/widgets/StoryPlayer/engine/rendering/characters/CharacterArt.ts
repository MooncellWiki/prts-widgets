import { CanvasSource, Texture } from "pixi.js";

import type { CharacterPortrait } from "../../characterPortrait";
import type { StoryFaceRect } from "../../types";
import type { FocusExpression } from "../core/FocusGhost";
import type { TextureLoad } from "../core/TextureAsset";

interface CharacterTexture {
  texture: Texture;
  expression?: FocusExpression;
  release?: () => void;
}

export interface CharacterArt {
  pos: { x: number; y: number };
  width: number;
  height: number;
  // Acquire on mount so a superseded asset load leaves no pinned bake.
  acquire: () => CharacterTexture | null;
}

export type CharacterArtLoad =
  CharacterArt | null | Promise<CharacterArt | null>;

interface CachedOverlay {
  refs: number;
  texture: Texture;
}

/** Soft cap. Artwork held by a live Image holder stays drawable. */
const FACE_OVERLAY_CACHE_LIMIT = 8;

/**
 * Torappu.AVG.AVGCharacterSpriteHubGroup._SetImage (2791 @ 0x18423B650)
 * passes the body and face together to AlphaSplitImageHolder. Bake them into
 * one Pixi texture before applying the holder's alpha, tint, or black gradient.
 */
export class CharacterArtLoader {
  private readonly overlays = new Map<string, CachedOverlay>();
  private destroyed = false;

  constructor(private readonly loadTexture: (key: string) => TextureLoad) {}

  load(portrait: CharacterPortrait): CharacterArtLoad {
    const { body, face, pos, size } = portrait;
    const bodyLoad = this.loadTexture(body);
    const faceLoad = face ? this.loadTexture(face.image) : null;
    const build = (
      bodyTexture: Texture | null,
      faceTexture: Texture | null,
    ): CharacterArt | null => {
      if (!bodyTexture || (face && !faceTexture) || this.destroyed) return null;
      return {
        pos,
        width: size.x || bodyTexture.width,
        height: size.y || bodyTexture.height,
        acquire: () => {
          if (this.destroyed) return null;
          return face && faceTexture
            ? this.acquireOverlay(
                body,
                face.image,
                bodyTexture,
                faceTexture,
                face.rect,
              )
            : { texture: bodyTexture };
        },
      };
    };
    return bodyLoad instanceof Promise || faceLoad instanceof Promise
      ? Promise.all([bodyLoad, faceLoad]).then(([body, face]) =>
          build(body, face),
        )
      : build(bodyLoad, faceLoad);
  }

  destroy(): void {
    this.destroyed = true;
    for (const { texture } of this.overlays.values()) texture.destroy(true);
    this.overlays.clear();
  }

  private acquireOverlay(
    baseKey: string,
    faceKey: string,
    body: Texture,
    face: Texture,
    rect: StoryFaceRect,
  ): CharacterTexture | null {
    const key = `${baseKey}\0${faceKey}\0${rect.x},${rect.y},${rect.w},${rect.h}`;
    let overlay = this.overlays.get(key);
    if (overlay) {
      this.overlays.delete(key);
    } else {
      const texture = this.bakeOverlay(body, face, rect);
      if (!texture) return null;
      overlay = { refs: 0, texture };
    }
    overlay.refs += 1;
    this.overlays.set(key, overlay);
    this.trimOverlays();
    const pinned = overlay;
    let released = false;
    return {
      texture: pinned.texture,
      expression: { body, face, rect },
      release: () => {
        if (released) return;
        released = true;
        pinned.refs -= 1;
        this.trimOverlays();
      },
    };
  }

  private trimOverlays(): void {
    for (const [key, overlay] of this.overlays) {
      if (this.overlays.size <= FACE_OVERLAY_CACHE_LIMIT) return;
      if (overlay.refs > 0) continue;
      this.overlays.delete(key);
      overlay.texture.destroy(true);
    }
  }

  private bakeOverlay(
    body: Texture,
    face: Texture,
    rect: StoryFaceRect,
  ): Texture | null {
    const bodySource = body.source?.resource as CanvasImageSource | undefined;
    const faceSource = face.source?.resource as CanvasImageSource | undefined;
    if (!bodySource || !faceSource) return null;
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(body.width));
    canvas.height = Math.max(1, Math.round(body.height));
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    const b = body.frame;
    ctx.drawImage(
      bodySource,
      b.x,
      b.y,
      b.width,
      b.height,
      0,
      0,
      canvas.width,
      canvas.height,
    );
    const f = face.frame;
    // The 2791 AVG_Char_AlphaSplit shader selects the face RGBA inside
    // its UV rectangle, including face texels with fractional or zero A.
    ctx.clearRect(rect.x, rect.y, rect.w, rect.h);
    ctx.drawImage(
      faceSource,
      f.x,
      f.y,
      f.width,
      f.height,
      rect.x,
      rect.y,
      rect.w,
      rect.h,
    );
    return new Texture({ source: new CanvasSource({ resource: canvas }) });
  }
}
