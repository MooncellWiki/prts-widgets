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
  /** 语种代码（cn / jp / en …）→ CV 名，来自干员页 CharinfoV2 的 char_info.cv */
  cvNames?: Record<string, string>;
  /** 干员页里嵌入时默认折叠；独立的 /语音记录 页展开 */
  collapsible?: boolean;
  /** 每条出下载图标（只在独立的 /语音记录 页给，同原版） */
  downloadable?: boolean;
}
