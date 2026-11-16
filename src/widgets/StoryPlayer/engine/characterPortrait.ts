import type { StoryFaceRect, StoryLinkNode } from "./types";

export interface CharacterPortrait {
  body: string;
  face?: { group: number; image: string; rect: StoryFaceRect };
  pos: StoryLinkNode["pos"];
  size: StoryLinkNode["size"];
}

/**
 * Torappu.AVG.AVGCharacterSpriteHub / AVGCharacterSpriteHubGroup._SetImage
 * (2791 @ 0x18423C580 / 0x18423B650). Resolve the selected image layers and
 * the hub's local rect from the Web export, shared by preload and rendering.
 */
export function describeCharacterPortrait(
  link: StoryLinkNode,
  expression: string,
): CharacterPortrait | null {
  const entry = link.array.find((item) => item.name === expression);
  if (!entry) return null;
  const { pos, size } = link;
  if (entry.group === -1 && entry.image)
    return { body: entry.image, pos, size };

  const group = link.groups[entry.group];
  if (group?.mode !== "face_overlay" || !entry.face) return null;
  return {
    body: group.base,
    face: { group: entry.group, image: entry.face, rect: group.faceRect },
    pos,
    size,
  };
}
