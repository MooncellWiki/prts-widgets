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

/**
 * decision 自动决策钩子（Web 调试侧用，无原生对应）。返回要选的
 * optionIndex；返回 null 或越界值时回落到 DecisionPanel 人工选择。
 */
export type DecisionPolicy = (decision: {
  decisionId: number;
  options: readonly string[];
  values: readonly number[];
}) => number | null;

/** seekToLine 推送的跳转阶段；reached/missed/aborted 为终态 */
export type LineSeekPhase = "seeking" | "reached" | "missed" | "aborted";

/** seekToLine 的进度/终态通知 */
export interface LineSeekUpdate {
  phase: LineSeekPhase;
  /** missed 终态的成因：正常播完还是出错 */
  reason?: "error" | "finished";
  target: number;
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
    | "unsupported_command"
    | "unsupported_visual"
    | "unknown_command";
}

export interface CharacterSlotInput {
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
  enterPosition?: { x: number; y: number };
  expression?: string;
  fadeIdentity?: string;
  focus?: number;
  focusMode?: "current_only" | "none" | "subset";
  focusSlots?: string[];
  inverse?: boolean;
  /**
   * The raw `name` ref, which is what native stores as
   * `AVGCharacterSlot.m_currentKey` and compares verbatim in `Set`
   * (@ 0x183eb38a0) to decide whether to reset the slot offset. Distinct from
   * `fadeIdentity`, which is the alias/index-stripped id used only to skip the
   * image cross-fade.
   */
  nativeKey?: string;
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
  transType?: number;
}

export interface CharacterActionInput {
  /**
   * Exit-only: present when the command carries BOTH xpos and ypos (native
   * TryGetParam<int> pair) — absolute story-space coordinates, mirroring the
   * `character` command's absolutePosition convention.
   */
  absolutePosition?: { x: number; y: number };
  block: boolean;
  /**
   * Native reads `direction` only in the exit branch with GetOrDefault
   * "left"; `_GenExitPosition` also accepts up/down. Undefined here means the
   * raw value was not one of the four native directions (native exits to the
   * slot rest anchor (0,0)).
   */
  direction?: "down" | "left" | "right" | "up";
  durationMs: number;
  /**
   * Zoom-only: native reads xpos/ypos as the [0,1] RectTransform pivot of the
   * character image (default 0.5/0.5, y measured from the bottom like Unity).
   * Runtime rejects out-of-range pivots before dispatch (native no-ops).
   */
  pivot?: { x: number; y: number };
  power: number;
  /**
   * DOShakePosition randomness. Native key is `random` (int, degrees, default
   * 10); the web renderer adapts it to a per-tick duty cycle.
   */
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
  /**
   * Native `width`/`height` params of `AVGImagePanel._LoadImage`
   * (GetOrDefault<float>("width", 1.0)): multipliers applied to the
   * SetNativeSize rect before screenadapt, not pixel sizes.
   */
  width?: number;
  height?: number;
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
  /**
   * Native port: `Torappu.AVG.SubtitlePanel._OnTypeWriterEnd` (2.7.61 VA
   * 0x183e94e80). Invoked exactly once when the subtitle typewriter finishes
   * on its own (or shows instantly with `delayMs <= 0`) so the runtime can
   * run its `RaiseAutoClick(typeWriter.messageLength)` equivalent. The
   * click-to-finish path never invokes it -- native `_OnClicked` ->
   * `TryFinish()` is driven by the runtime's own click handler.
   */
  onTypingComplete?: () => void;
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
  /**
   * Native provenance: when `name` cannot be resolved, native still allocates
   * the slot and runs its Show/SlotUpdate tween (only AVGCharacterSlot logs
   * an internal error), so `block` timing must survive a missing character.
   */
  characterMissing?: boolean;
  /**
   * Slot-layout keys. `undefined` means the script omitted the key, which is
   * load-bearing: Show falls back to the serialized prefab defaults, while
   * SlotUpdate (@ 0x183eb20a0) passes the slot's live transform as each
   * `GetFloat`/`GetInt` default, so an omitted key holds its current value
   * instead of snapping back.
   *
   * `_characterSlot.localPosition` keys; `charOffsetY` carries native's
   * `- maskHeight / 2` correction in the renderer layout math. Only Show
   * reads them -- SlotUpdate never touches the slot node.
   */
  charOffsetX?: number;
  charOffsetY?: number;
  expression?: string;
  /** `animateRatio * fadetime` in ms; AVGCharacterCutinSlot is IFadeTimeRatio. */
  fadeMs: number;
  fadeStyle?: CharacterCutinFadeStyle;
  offsetX?: number;
  offsetY?: number;
  /** `_zoomAndPovRectTransform.anchoredPosition = (-povX, -povY)`. */
  povX?: number;
  povY?: number;
  widgetId: string;
  /** Mask size along the main axis; `_zoomAndPovRectTransform.localScale`. */
  width?: number;
  zoom?: number;
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

/**
 * Web 适配（无原生对应）：引擎向 UI 推送的事件表（mitt）。
 * 以后再有字段需要即时性，往这里加一项即可，不必为每个字段开一条专用通道。
 */
export type StoryPlayerEvents = {
  /** 当前屏幕对话框正在显示的源行 lineNumber；null 表示无显示文本 */
  displayedLineChange: number | null;
};

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
  /**
   * Web 适配（无原生对应）：注册当前显示行变更推送，替代 UI 轮询
   * getDisplayedLineIndex；订阅时立即补发一次当前值。返回注销函数
   */
  onDisplayedLineChange: (
    listener: (lineIndex: number | null) => void,
  ) => () => void;
  setAutoPlayMode: (mode: AutoPlayMode) => void;
  setAutoPlaySpeedLevel: (level: number) => void;
  /** 注入/移除 decision 自动决策钩子（调试入口用） */
  setDecisionPolicy: (policy: DecisionPolicy | null) => void;
  /**
   * Web 调试适配（无原生对应）：编排一次「快速播放直达目标行」。注入按
   * choices 的自动决策（表外 decision 默认第 0 项）并以 quick_play 最高档
   * 推进；到达目标行（reached）/ 播完出错（missed）/ 使用者自己切走播放
   * 模式（aborted）时收尾并经 onUpdate 推终态，脚本自身的模式切换不算
   * 干预。返回取消函数：静默摘掉策略，不推终态。
   */
  seekToLine: (
    target: number,
    choices: ReadonlyMap<number, number>,
    onUpdate: (update: LineSeekUpdate) => void,
  ) => () => void;
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
