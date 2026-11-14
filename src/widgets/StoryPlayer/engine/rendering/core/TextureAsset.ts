import { Assets, type Texture } from "pixi.js";

export type TextureLoad = Texture | null | Promise<Texture | null>;

/** Reads a texture by the same URL used to preload it. */
export function getCachedTexture(url: string): Texture | undefined {
  return Assets.cache.has(url) ? Assets.get<Texture>(url) : undefined;
}
