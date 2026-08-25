export const STORY_WIDTH = 1280;
export const STORY_HEIGHT = 720;

export type StoryCommandValue = boolean | number | string;
export type StoryCommandArgs = Record<string, StoryCommandValue>;

export interface StoryFaceRect {
  h: number;
  w: number;
  x: number;
  y: number;
}

export interface StoryCharacterGroupFaceOverlay {
  base: string;
  faceRect: StoryFaceRect;
  mode: "face_overlay";
}

export interface StoryCharacterGroupSingle {
  mode: "single";
}

export type StoryCharacterGroup =
  StoryCharacterGroupFaceOverlay | StoryCharacterGroupSingle;

export interface StoryCharacterEntry {
  alias: string;
  face?: string;
  group: number;
  image?: string;
  name: string;
}

export interface StoryLinkNode {
  array: StoryCharacterEntry[];
  groups: StoryCharacterGroup[];
  pos: { x: number; y: number };
  size: { x: number; y: number };
}

export interface ParsedCommandLine {
  args: StoryCommandArgs;
  command: string;
  content: string;
  kind: "command";
  lineNumber: number;
  paramPresent: boolean;
  raw: string;
  trailingText: string;
}

export interface ParsedDialogueLine {
  kind: "dialogue";
  lineNumber: number;
  raw: string;
  speaker: string;
  text: string;
}

export interface ParsedNarrationLine {
  kind: "narration";
  lineNumber: number;
  raw: string;
  text: string;
}

export type ParsedLine =
  ParsedCommandLine | ParsedDialogueLine | ParsedNarrationLine;

export interface StoryMetadata {
  args: StoryCommandArgs;
  characterSortType: string;
  denyAutoSwitchScene: boolean;
  dontClearGameObjectPoolOnStart: boolean;
  fitMode: "BLACK_MASK" | "DEFAULT";
  id: string;
  isAutoable: boolean;
  isSkippable: boolean;
  isTutorial: boolean;
  isVideoOnly: boolean;
  title: string;
}

export type PlayerState =
  | "error"
  | "finished"
  | "idle"
  | "running"
  | "waiting_decision"
  | "waiting_input"
  | "waiting_timer"
  | "waiting_video";
export type AutoPlayMode = "button_auto" | "default" | "quick_play";

export interface AutoPlayState {
  buttonSpeedLevel: number;
  mode: AutoPlayMode;
  quickSpeedLevel: number;
}

/** 一次已执行的选择：decisionId 用该 decision 源行的 lineNumber */
export interface RuntimeChoiceSelection {
  decisionId: number;
  optionIndex: number;
  value: number;
}

/** showDecision 的结果：点击的选项下标 + 写入闸门的值（value 会跨 decision 复用，不能反查下标） */
export interface DecisionSelection {
  /** 玩家点击的选项下标；-1 表示面板未经点击被清除（跳过/销毁） */
  optionIndex: number;
  /** `values[optionIndex] ?? optionIndex + 1`，写入 decisionSelectValue */
  value: number;
}

/** 播放器当前播放位置：显示中的源行 + 实际执行过的全部选择历史 */
export interface RuntimeLogPosition {
  lineIndex: number | null;
  selections: RuntimeChoiceSelection[];
}

export interface RuntimeWarning {
  command?: string;
  cursor: number;
  detail?: string;
  lineNumber?: number;
  type:
    | "error"
    | "invalid_parameter"
    | "missing_asset"
    | "parse"
    | "unimplemented_command"
    | "unsupported_command"
    | "unsupported_visual"
    | "unknown_command";
}

export interface CharacterSlotInput {
  absolutePosition?: { x?: number; y?: number };
  action?:
    "jump" | "move" | "rotate" | "setpos" | "shake" | "shakemove" | "zoom";
  angle?: number;
  alphaFrom?: number;
  alphaTo?: number;
  blackEnd?: number;
  blackStart?: number;
  block?: boolean;
  characterKey?: string;
  circles?: number;
  dimmed?: boolean;
  durationMs?: number;
  enterFrom?: "down" | "left" | "right" | "up";
  expression?: string;
  fadeIdentity?: string;
  focusMode?: "current_only" | "none" | "subset";
  focusSlots?: string[];
  inverse?: boolean;
  positionFrom?: { x: number; y: number };
  positionTo?: { x: number; y: number };
  posZoom?: { x: number; y: number };
  power?: number;
  preserveTransform?: boolean;
  randomness?: number;
  replaceFadeMs?: number;
  resetTransform?: boolean;
  scaleX?: number;
  scaleY?: number;
  slot: string;
  stop?: boolean;
  times?: number;
}

export interface CharacterActionInput {
  block: boolean;
  direction?: "left" | "right";
  durationMs: number;
  power: number;
  randomness: number;
  rotationFromDeg: number;
  rotationLeftDeg: number;
  rotationRightDeg: number;
  scaleX?: number;
  scaleY?: number;
  slot: string;
  stop: boolean;
  times: number;
  type: "exit" | "jump" | "move" | "shake" | "zoom";
  xOffset: number;
  yOffset: number;
}

export interface BlockerInput {
  block: boolean;
  fadeMs: number;
  from: { a: number; b: number; g: number; r: number };
  image?: string;
  inverse: boolean;
  style: "default" | "slider" | "verticalslider";
  to: { a: number; b: number; g: number; r: number };
}

export interface CurtainInput {
  alphaFrom?: number;
  alphaTo?: number;
  block: boolean;
  delayMs: number;
  direction: number;
  fadeMs: number;
  fillFrom?: number;
  fillTo: number;
  grad: boolean;
}

export interface CameraShakeInput {
  block: boolean;
  durationMs: number;
  fadeOut: boolean;
  infinite: boolean;
  randomness: number;
  stop: boolean;
  vibrato: number;
  xStrength: number;
  yStrength: number;
}

export type FocusColorMode = "Colorinverse" | "Grayscale" | "None";

export interface FocusOutInput {
  block: boolean;
  durationMs: number;
  from?: number;
  id: string;
  to: number;
  type: string;
}

export interface FocusParamInput {
  blur: boolean;
  color: FocusColorMode;
}

export interface BackgroundInput {
  block: boolean;
  fadeMs: number;
  scaleX: number;
  scaleY: number;
  screenAdapt?: "coverall" | "fill" | "height" | "showall" | "width";
  tiled: boolean;
  x: number;
  y: number;
}

export interface BackgroundTweenInput {
  block: boolean;
  durationMs: number;
  xFrom?: number;
  xScaleFrom?: number;
  xScaleTo?: number;
  xTo?: number;
  yFrom?: number;
  yScaleFrom?: number;
  yScaleTo?: number;
  yTo?: number;
}

export interface ImageTweenInput {
  block: boolean;
  durationMs: number;
  xFrom?: number;
  xScaleFrom?: number;
  xScaleTo?: number;
  xTo?: number;
  yFrom?: number;
  yScaleFrom?: number;
  yScaleTo?: number;
  yTo?: number;
}

export interface ImageRotateInput {
  angleDeg: number;
  block: boolean;
  circles: number;
  durationMs: number;
  inverse: boolean;
}

export interface LargeBackgroundTweenInput {
  block: boolean;
  durationMs: number;
  xFrom?: number;
  xScaleFrom?: number;
  xScaleTo?: number;
  xTo?: number;
  yFrom?: number;
  yScaleFrom?: number;
  yScaleTo?: number;
  yTo?: number;
}

export interface GridBackgroundInput {
  assetKind?: "background" | "image";
  block: boolean;
  fadeMs: number;
  imageKeys: string[];
  initPositionMode?: "center" | "default" | "lowercenter" | "upperleft";
  layout?: "grid" | "large" | "vertical";
  scaleX: number;
  scaleY: number;
  solidHeights: number[];
  solidWidths: number[];
  x: number;
  y: number;
}

export interface ShowItemInput {
  /** Alpha of the full-screen black backdrop the photo slot puts behind the item. */
  blackAlpha: number;
  block: boolean;
  fadeMs: number;
  key: string;
  offsetX: number;
  offsetY: number;
}

export interface CgItemInput {
  assetKey: string;
  alphaDelayMs: number;
  alphaDurationMs: number;
  alphaFrom: number;
  alphaTo: number;
  block: boolean;
  colorFrom?: { r: number; g: number; b: number; a: number };
  colorTo?: { r: number; g: number; b: number; a: number };
  ease: string;
  height: number;
  key: string;
  positionDelayMs: number;
  positionDurationMs: number;
  positionFrom?: { x: number; y: number };
  positionTo?: { x: number; y: number };
  rotationDurationMs: number;
  rotationFrom: number;
  rotationTo: number;
  scaleDelayMs: number;
  scaleDurationMs: number;
  scaleFrom: number;
  scaleTo: number;
  width: number;
}

export interface SubtitleInput {
  alignment: "center" | "left" | "right";
  delayMs: number;
  sizePx: number;
  text: string;
  widthPx: number;
  x: number;
  y: number;
}

export interface StickerInput extends SubtitleInput {
  append: boolean;
  fadeMs: number;
  id: string;
}

export interface SpellStickerInput {
  alpha: number;
  angle?: number;
  content: string;
  id: string;
  style: string;
  x?: number;
  xScale?: number;
  y?: number;
  yScale?: number;
}

export interface AnimTextInput {
  block: boolean;
  content: string;
  id: string;
  name: string;
  position: { x: number; y: number };
  style: string;
}

export type AvgDisplayStyle =
  "animekv" | "bgeffect" | "bg" | "character" | "effect" | "spine" | string;
export type AvgDisplaySlot = "bgover" | "cgover" | "charover" | string;

export interface AvgDisplayInput {
  alphaFrom?: number;
  alphaTo?: number;
  block: boolean;
  durationMs: number;
  entryFrom?: number;
  entryIndex: number;
  entryTo?: number;
  id: string;
  layer: number;
  name: string;
  rotationX: number;
  rotationY: number;
  rotationZ: number;
  scaleX?: number;
  scaleXFrom?: number;
  scaleXTo?: number;
  scaleY?: number;
  scaleYFrom?: number;
  scaleYTo?: number;
  slot: AvgDisplaySlot;
  style: AvgDisplayStyle;
  x?: number;
  xFrom?: number;
  xTo?: number;
  y?: number;
  yFrom?: number;
  yTo?: number;
}

export interface TimerStickerInput {
  durationMs: number;
  fromAlpha: number;
  limitSeconds?: number;
  sizePx: number;
  toAlpha: number;
  widthPx: number;
  x: number;
  y: number;
}

export interface TimerClearInput {
  durationMs: number;
}

/**
 * Native provenance: the `AVGCharacterCutinSlot.FadeStyle` /
 * `AVGShowItemCutinSlot.FadeStyle` enums, whose member names are the literal
 * `fadestyle` values a script may write. Note the vertical members spell
 * `bottom` correctly -- misspelling them makes the value unmatchable, which
 * silently degrades the command to a plain `fade`.
 */
export type CharacterCutinFadeStyle =
  | "fade"
  | "horiz_expand_center"
  | "horiz_expand_left2right"
  | "horiz_expand_right2left"
  | "vert_expand_center"
  | "vert_expand_top2bottom"
  | "vert_expand_bottom2top";

export interface CharacterCutinInput {
  block: boolean;
  characterKey?: string;
  expression?: string;
  fadeMs: number;
  fadeStyle?: CharacterCutinFadeStyle;
  height: number;
  offsetX: number;
  offsetY: number;
  widgetId: string;
  width: number;
}

export type InterludeElementType = 0 | 1 | 2 | 3;

export interface InterludeInput {
  alphaDurationMs: number;
  alphaFrom: number;
  alphaTo: number;
  avatarCharacterKey?: string;
  avatarExpression?: string;
  block: boolean;
  channel: number;
  charName: string;
  clear: boolean;
  direction: string;
  durationMs: number;
  maskId: string;
  name: string;
  offset: { x: number; y: number };
  positionFrom?: { x: number; y: number };
  positionTo?: { x: number; y: number };
  scaleDurationMs: number;
  scaleFrom?: { x: number; y: number };
  scaleTo?: { x: number; y: number };
  size: { x: number; y: number };
  slot: string;
  style: number;
  switchOn: boolean;
  templateSizeDurationMs: number;
  templateSizeFrom: { x: number; y: number };
  templateSizeTo: { x: number; y: number };
  type: InterludeElementType;
}

export interface StoryRenderer {
  clearCgItems: (
    key?: string,
    fadeMs?: number,
    ease?: string,
    block?: boolean,
  ) => Promise<void> | void;
  clearAvgDisplays: () => Promise<void> | void;
  clearAnimTexts: () => Promise<void> | void;
  setCameraEffect: (
    effect: "Colorinverse" | "Grayscale",
    amount: number,
    durationMs: number,
    block: boolean,
    keep: boolean,
    initialAmount?: number,
  ) => Promise<void> | void;
  setFocusOut: (input: FocusOutInput) => Promise<void> | void;
  setFocusParam: (input: FocusParamInput) => void;
  clearBackground: (fadeMs?: number, block?: boolean) => Promise<void> | void;
  clearCharacters: (slot?: string, fadeMs?: number) => Promise<void> | void;
  clearCurtains: (fadeMs?: number, block?: boolean) => Promise<void> | void;
  clearGridBackground: (
    fadeMs?: number,
    block?: boolean,
  ) => Promise<void> | void;
  clearImage: (fadeMs?: number, block?: boolean) => Promise<void> | void;
  clearLargeImage: (fadeMs?: number, block?: boolean) => Promise<void> | void;
  clearItems: (fadeMs?: number, block?: boolean) => Promise<void> | void;
  clearSticker: (id?: string, fadeMs?: number) => Promise<void> | void;
  clearStickers: (fadeMs?: number) => Promise<void> | void;
  clearSpellStickers: () => Promise<void> | void;
  clearSubtitle: (fadeMs?: number) => Promise<void> | void;
  clearTimerSticker: (input?: TimerClearInput) => Promise<void> | void;
  clearCharacterCutin: (widgetId?: string) => Promise<void>;
  clearInterludes: () => Promise<void>;
  destroy: () => void;
  finishTextTyping: () => boolean;
  mount: (host: HTMLElement) => Promise<void>;
  playVideo: (url: string) => Promise<void>;
  setAnimText: (input: AnimTextInput) => Promise<void>;
  setAvgDisplay: (input: AvgDisplayInput) => Promise<void>;
  setBackground: (key: string, input?: BackgroundInput) => Promise<void>;
  setBackgroundTween: (input: BackgroundTweenInput) => Promise<void>;
  setBlocker: (input: BlockerInput) => Promise<void>;
  setCharacter: (input: CharacterSlotInput) => Promise<void>;
  setCharacterCutin: (input: CharacterCutinInput) => Promise<void>;
  setCurtain: (input: CurtainInput) => Promise<void>;
  setGridBackground: (input: GridBackgroundInput) => Promise<void>;
  setLargeImage: (input: GridBackgroundInput) => Promise<void>;
  runCharacterAction: (input: CharacterActionInput) => Promise<void>;
  setDialogue: (
    speaker: string,
    text: string,
    tagStyles?: Record<string, { fill: string }>,
  ) => void;
  setImage: (key: string, input?: BackgroundInput) => Promise<void>;
  setImageRotate: (input: ImageRotateInput) => Promise<void>;
  setImageTween: (input: ImageTweenInput) => Promise<void>;
  setInterlude: (input: InterludeInput) => Promise<void>;
  setLargeBackgroundTween: (input: LargeBackgroundTweenInput) => Promise<void>;
  setLargeImageTween: (input: LargeBackgroundTweenInput) => Promise<void>;
  showItem: (input: ShowItemInput) => Promise<void>;
  showCgItem: (input: CgItemInput) => Promise<void>;
  setSticker: (input: StickerInput) => Promise<void> | void;
  setSpellSticker: (input: SpellStickerInput) => Promise<void> | void;
  hideSpellSticker: (id: string) => Promise<void> | void;
  setSubtitle: (input: SubtitleInput) => Promise<void> | void;
  setTimerSticker: (input: TimerStickerInput) => Promise<void> | void;
  shakeCamera: (input: CameraShakeInput) => Promise<void>;
  showDecision: (
    options: string[],
    values: number[],
  ) => Promise<DecisionSelection>;
  stopVideo: () => void;
}

export interface PlayMusicInput {
  crossfadeMs: number;
  delayMs: number;
  intro?: string;
  key: string;
  volume: number;
}

export interface PlaySoundInput {
  channel: string;
  delayMs: number;
  key: string;
  loop: boolean;
  volume: number;
}

export interface StoryAudio {
  destroy: () => void;
  playMusic: (input: PlayMusicInput) => Promise<void>;
  playSound: (input: PlaySoundInput) => Promise<void>;
  setMusicVolume: (volume: number, fadeMs: number) => Promise<void>;
  setSoundVolume: (
    channel: string,
    volume: number,
    fadeMs: number,
  ) => Promise<void>;
  stopMusic: (fadeMs: number) => Promise<void>;
  stopSound: (channel: string, fadeMs: number) => Promise<void>;
}

export interface StoryPlayer {
  advance: () => Promise<void>;
  canSkipNode: () => boolean;
  destroy: () => void;
  getAutoPlayState: () => AutoPlayState;
  /** 最近一次 decision 玩家所选的 value（0 = 未做选择/默认分支） */
  getDecisionSelectValue: () => number;
  getDisplayedLineIndex: () => number | null;
  /** 当前播放位置：显示中的源行 + 实际执行过的全部选择历史（用于 Log All 路径求值） */
  getLogPosition: () => RuntimeLogPosition;
  getState: () => PlayerState;
  mount: (host: HTMLElement) => Promise<void>;
  setAutoPlayMode: (mode: AutoPlayMode) => void;
  setAutoPlaySpeedLevel: (level: number) => void;
  skipNode: () => Promise<void>;
  start: () => Promise<void>;
}

export interface RuntimeOptions {
  animateRatio?: number;
  firstRead?: boolean;
  onWarning?: (warning: RuntimeWarning) => void;
  sleep?: (ms: number) => Promise<void>;
  typingIntervalMs?: number;
}
