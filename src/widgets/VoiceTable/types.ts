import type { SkinVoiceType } from "./consts";

export type VoiceBaseItem = {
  lang: string;
  path: string;
};

export interface OverrideVoiceBaseItem extends VoiceBaseItem {
  mode: SkinVoiceType;
}

export interface VoiceDataItem {
  title?: string;
  index?: string;
  fileName?: string;
  directLinks: Record<string, string>;
  cond?: string;
  detail: Record<string, string>;
  placeType?: string;
}

export interface Props {
  tocTitle?: string;
  voiceKey?: string;
  voiceData: VoiceDataItem[];
  langArr?: string[];
  voiceBase?: VoiceBaseItem[];
  overrideVoiceBase?: OverrideVoiceBaseItem[];
}
