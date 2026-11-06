import { safeFilename } from "./utils";

import type { StoryFaceRect } from "../StoryPlayer/engine/types";

/**
 * 下载：torappu 的图是跨源的，<a download> 对跨源地址不生效（浏览器会直接打开），
 * 所以先 fetch 成 blob（torappu 回 Access-Control-Allow-Origin: *），再用同源的 blob: 地址存。
 */
export function saveBlob(blob: Blob, filename: string): void {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = safeFilename(filename);
  anchor.style.display = "none";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

async function fetchBlob(url: string): Promise<Blob> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} ${response.status}`);
  return response.blob();
}

export async function downloadUrl(
  url: string,
  filename: string,
): Promise<void> {
  saveBlob(await fetchBlob(url), filename);
}

async function decode(blob: Blob): Promise<HTMLImageElement> {
  const objectUrl = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.src = objectUrl;
    await image.decode();
    return image;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

/** 叠图角色按原图尺寸合成一张 PNG（脸拉伸进 faceRect，同 StoryPlayer） */
export async function composeCharacter(
  baseUrl: string,
  faceUrl: string,
  rect: StoryFaceRect,
): Promise<Blob> {
  const [base, face] = await Promise.all([
    fetchBlob(baseUrl).then(decode),
    fetchBlob(faceUrl).then(decode),
  ]);
  const canvas = document.createElement("canvas");
  canvas.width = base.naturalWidth;
  canvas.height = base.naturalHeight;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("canvas 2d context is unavailable");
  context.drawImage(base, 0, 0);
  context.drawImage(face, rect.x, rect.y, rect.w, rect.h);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("encode composite"));
    }, "image/png");
  });
}
