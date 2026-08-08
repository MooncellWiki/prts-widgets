import { STORY_HEIGHT, STORY_WIDTH } from "./types";

const LEGACY_STORY_WIDTH = 960;
const LEGACY_STORY_HEIGHT = 540;
const LEGACY_SHOWITEM_CONTENT_SCALE = 0.6;
const LEGACY_SHOWITEM_BORDER_PX = 7.5;

export interface LegacyShowItemLayout {
  borderPx: number;
  contentHeight: number;
  contentWidth: number;
  scale: number;
}

export function computeLegacyShowItemLayout(
  sourceWidth: number,
  sourceHeight: number,
): LegacyShowItemLayout {
  const width = Math.max(1, sourceWidth);
  const height = Math.max(1, sourceHeight);
  const viewportScale = Math.min(
    STORY_WIDTH / LEGACY_STORY_WIDTH,
    STORY_HEIGHT / LEGACY_STORY_HEIGHT,
  );
  const scale = LEGACY_SHOWITEM_CONTENT_SCALE * viewportScale;

  return {
    borderPx: LEGACY_SHOWITEM_BORDER_PX * viewportScale,
    contentHeight: height * scale,
    contentWidth: width * scale,
    scale,
  };
}
