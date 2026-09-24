import type { Context } from "../../src/widgets/StoryPlayer/context";
import type {
  AnimTextInput,
  AvgDisplayInput,
  BackgroundInput,
  BackgroundTweenInput,
  BlockerInput,
  CameraShakeInput,
  CgItemInput,
  CharacterActionInput,
  CharacterCutinInput,
  CharacterSlotInput,
  CurtainInput,
  DecisionSelection,
  FocusOutInput,
  FocusParamInput,
  GridBackgroundInput,
  ImageRotateInput,
  ImageTweenInput,
  InterludeInput,
  LargeBackgroundTweenInput,
  PlayMusicInput,
  PlaySoundInput,
  ShowItemInput,
  SpellStickerInput,
  StickerInput,
  StickerTweenInput,
  StoryAudio,
  StoryRenderer,
  SubtitleInput,
  TimerClearInput,
  TimerStickerInput,
} from "../../src/widgets/StoryPlayer/engine/types";

export class FakeRenderer implements StoryRenderer {
  animTextCalls: AnimTextInput[] = [];
  avgDisplayCalls: AvgDisplayInput[] = [];
  actionCalls: CharacterActionInput[] = [];
  backgroundCalls: Array<{ input?: BackgroundInput; key: string }> = [];
  backgroundTweenCalls: BackgroundTweenInput[] = [];
  blockerCalls: BlockerInput[] = [];
  cameraEffectCalls: Array<{
    amount: number;
    block: boolean;
    durationMs: number;
    effect: string;
    initialAmount?: number;
    keep: boolean;
  }> = [];
  characterCalls: CharacterSlotInput[] = [];
  characterCutinCalls: CharacterCutinInput[] = [];
  clearCharacterCutinCalls: string[] = [];
  clearedSlots: Array<{ fadeMs?: number; slot?: string }> = [];
  clearItemsCalls: Array<{ block: boolean; fadeMs: number }> = [];
  clearCgItemCalls: Array<{
    block: boolean;
    ease: string;
    fadeMs: number;
    key?: string;
  }> = [];
  cgItemCalls: CgItemInput[] = [];
  curtainCalls: CurtainInput[] = [];
  curtainClearCalls: Array<{ block: boolean; fadeMs: number }> = [];
  focusOutCalls: FocusOutInput[] = [];
  focusParamCalls: FocusParamInput[] = [];
  clearCharactersHandler?: (
    slot?: string,
    fadeMs?: number,
  ) => Promise<void> | void;
  gridBackgroundCalls: GridBackgroundInput[] = [];
  gridBackgroundClearCalls: Array<{ block: boolean; fadeMs: number }> = [];
  imageCalls: Array<{ input?: BackgroundInput; key: string }> = [];
  imageRotateCalls: ImageRotateInput[] = [];
  imageTweenCalls: ImageTweenInput[] = [];
  interludeCalls: InterludeInput[] = [];
  largeBackgroundTweenCalls: LargeBackgroundTweenInput[] = [];
  largeImageTweenCalls: LargeBackgroundTweenInput[] = [];
  lastDialogue = { speaker: "", text: "" };
  dialogueTexts: string[] = [];
  showItemCalls: ShowItemInput[] = [];
  stickerCalls: StickerInput[] = [];
  stickerTweenCalls: StickerTweenInput[] = [];
  spellStickerCalls: SpellStickerInput[] = [];
  spellStickerHideCalls: string[] = [];
  spellStickerClearCount = 0;
  stickerClearCalls: Array<{ fadeMs: number; id?: string }> = [];
  stickersClearCalls: number[] = [];
  subtitleCalls: SubtitleInput[] = [];
  subtitleClearCalls: number[] = [];
  shakeCalls: CameraShakeInput[] = [];
  timerClearCalls: TimerClearInput[] = [];
  timerStickerCalls: TimerStickerInput[] = [];
  typingActive = false;
  videoCalls: string[] = [];
  videoStopped = false;
  videoWaiter: Promise<void> = Promise.resolve();
  decisionValue = 0;
  decisionIndex = -1;
  decisionCalls: { options: string[]; values: number[] }[] = [];
  private resolveVideoWaiter: (() => void) | null = null;

  setCameraEffect(
    effect: "Colorinverse" | "Grayscale",
    amount: number,
    durationMs: number,
    block: boolean,
    keep: boolean,
    initialAmount?: number,
  ): void {
    this.cameraEffectCalls.push({
      amount,
      block,
      durationMs,
      effect,
      initialAmount,
      keep,
    });
  }

  setFocusOut(input: FocusOutInput): void {
    this.focusOutCalls.push(input);
  }

  setFocusParam(input: FocusParamInput): void {
    this.focusParamCalls.push(input);
  }

  clearBackground(): void {}
  clearAvgDisplays(): void {}
  clearAnimTexts(): void {}
  clearCharacters(slot?: string, fadeMs?: number): Promise<void> | void {
    this.clearedSlots.push({ fadeMs, slot });
    return this.clearCharactersHandler?.(slot, fadeMs);
  }

  clearCurtains(fadeMs = 0, block = false): void {
    this.curtainClearCalls.push({ block, fadeMs });
  }

  clearGridBackground(fadeMs = 0, block = false): void {
    this.gridBackgroundClearCalls.push({ block, fadeMs });
  }

  clearImage(): void {}
  clearLargeImage(fadeMs = 0, block = false): void {
    this.gridBackgroundClearCalls.push({ block, fadeMs });
  }

  clearItems(fadeMs = 0, block = false): void {
    this.clearItemsCalls.push({ block, fadeMs });
  }

  clearCgItems(
    key?: string,
    fadeMs = 130,
    ease = "Linear",
    block = false,
  ): void {
    this.clearCgItemCalls.push({ block, ease, fadeMs, key });
  }

  clearSticker(id?: string, fadeMs = 0): void {
    this.stickerClearCalls.push({ fadeMs, id });
  }

  clearStickers(fadeMs = 0): void {
    this.stickersClearCalls.push(fadeMs);
  }

  clearSpellStickers(): void {
    this.spellStickerClearCount += 1;
  }

  hideSpellSticker(id: string): void {
    this.spellStickerHideCalls.push(id);
  }

  clearSubtitle(fadeMs = 0): void {
    this.subtitleClearCalls.push(fadeMs);
  }

  clearTimerSticker(input?: TimerClearInput): void {
    if (input) this.timerClearCalls.push(input);
  }

  clearCharacterCutin(widgetId?: string): Promise<void> {
    this.clearCharacterCutinCalls.push(widgetId ?? "");
    return Promise.resolve();
  }

  clearInterludes(): Promise<void> {
    return Promise.resolve();
  }

  destroy(): void {}
  finishTextTyping(): boolean {
    if (!this.typingActive) return false;
    this.typingActive = false;
    return true;
  }

  async mount(): Promise<void> {}
  async playVideo(url: string): Promise<void> {
    this.videoCalls.push(url);
    this.videoStopped = false;
    this.videoWaiter = new Promise<void>((resolve) => {
      this.resolveVideoWaiter = resolve;
    });
    await this.videoWaiter;
  }

  async setAnimText(input: AnimTextInput): Promise<void> {
    this.animTextCalls.push(input);
  }

  async setAvgDisplay(input: AvgDisplayInput): Promise<void> {
    this.avgDisplayCalls.push(input);
  }

  async setBackground(key: string, input?: BackgroundInput): Promise<void> {
    this.backgroundCalls.push({ input, key });
  }

  async setBackgroundTween(input: BackgroundTweenInput): Promise<void> {
    this.backgroundTweenCalls.push(input);
  }

  async setBlocker(input: BlockerInput): Promise<void> {
    this.blockerCalls.push(input);
  }

  async setCharacter(input: CharacterSlotInput): Promise<void> {
    this.characterCalls.push(input);
  }

  async setCharacterCutin(input: CharacterCutinInput): Promise<void> {
    this.characterCutinCalls.push(input);
  }

  async setCurtain(input: CurtainInput): Promise<void> {
    this.curtainCalls.push(input);
  }

  async setGridBackground(input: GridBackgroundInput): Promise<void> {
    this.gridBackgroundCalls.push(input);
  }

  async setLargeImage(input: GridBackgroundInput): Promise<void> {
    this.gridBackgroundCalls.push(input);
  }

  async runCharacterAction(input: CharacterActionInput): Promise<void> {
    this.actionCalls.push(input);
  }

  setDialogue(speaker: string, text: string): void {
    this.lastDialogue = { speaker, text };
    this.dialogueTexts.push(text);
  }

  async setImage(key: string, input?: BackgroundInput): Promise<void> {
    this.imageCalls.push({ input, key });
  }
  async setImageRotate(input: ImageRotateInput): Promise<void> {
    this.imageRotateCalls.push(input);
  }

  async setImageTween(input: ImageTweenInput): Promise<void> {
    this.imageTweenCalls.push(input);
  }
  async setInterlude(input: InterludeInput): Promise<void> {
    this.interludeCalls.push(input);
  }

  async setLargeBackgroundTween(
    input: LargeBackgroundTweenInput,
  ): Promise<void> {
    this.largeBackgroundTweenCalls.push(input);
  }

  async setLargeImageTween(input: LargeBackgroundTweenInput): Promise<void> {
    this.largeImageTweenCalls.push(input);
  }

  async showItem(input: ShowItemInput): Promise<void> {
    this.showItemCalls.push(input);
  }

  async showCgItem(input: CgItemInput): Promise<void> {
    this.cgItemCalls.push(input);
  }

  async setSticker(input: StickerInput): Promise<void> {
    this.stickerCalls.push(input);
    this.typingActive = input.delayMs > 0;
    if (input.delayMs <= 0) input.onTypingComplete?.();
  }

  /** Sticker counterpart of finishSubtitleTypingNaturally. */
  finishStickerTypingNaturally(): void {
    this.typingActive = false;
    this.stickerCalls.at(-1)?.onTypingComplete?.();
  }

  stickerTween(input: StickerTweenInput): void {
    this.stickerTweenCalls.push(input);
  }

  setSpellSticker(input: SpellStickerInput): void {
    this.spellStickerCalls.push(input);
  }

  async setSubtitle(input: SubtitleInput): Promise<void> {
    this.subtitleCalls.push(input);
    this.typingActive = input.delayMs > 0;
    // Faithful to PixiStoryRenderer: an instant subtitle is done typing the
    // moment it is shown.
    if (input.delayMs <= 0) input.onTypingComplete?.();
  }

  /**
   * Emulates the real renderer clearing its typing target and running the
   * `SubtitlePanel._OnTypeWriterEnd` callback when the typewriter ends on its
   * own (as opposed to a click finishing it).
   */
  finishSubtitleTypingNaturally(): void {
    this.typingActive = false;
    this.subtitleCalls.at(-1)?.onTypingComplete?.();
  }

  async setTimerSticker(input: TimerStickerInput): Promise<void> {
    this.timerStickerCalls.push(input);
  }

  async shakeCamera(input: CameraShakeInput): Promise<void> {
    this.shakeCalls.push(input);
  }

  async showDecision(
    options: string[],
    values: number[],
  ): Promise<DecisionSelection> {
    this.decisionCalls.push({ options, values });
    return { optionIndex: this.decisionIndex, value: this.decisionValue };
  }

  stopVideo(): void {
    this.videoStopped = true;
    this.resolveVideoWaiter?.();
    this.resolveVideoWaiter = null;
  }

  finishVideo(): void {
    this.resolveVideoWaiter?.();
    this.resolveVideoWaiter = null;
  }
}

export class FakeAudio implements StoryAudio {
  musicVolumeCalls: Array<{ fadeMs: number; volume: number }> = [];
  playMusicCalls: PlayMusicInput[] = [];
  playSoundCalls: PlaySoundInput[] = [];
  soundVolumeCalls: Array<{ channel: string; fadeMs: number; volume: number }> =
    [];
  stopMusicCalls: number[] = [];
  stopSoundCalls: Array<{ channel: string; fadeMs: number }> = [];

  async playMusic(input: PlayMusicInput): Promise<void> {
    this.playMusicCalls.push(input);
  }

  async playSound(input: PlaySoundInput): Promise<void> {
    this.playSoundCalls.push(input);
  }

  async setMusicVolume(volume: number, fadeMs: number): Promise<void> {
    this.musicVolumeCalls.push({ fadeMs, volume });
  }

  async setSoundVolume(
    channel: string,
    volume: number,
    fadeMs: number,
  ): Promise<void> {
    this.soundVolumeCalls.push({ channel, fadeMs, volume });
  }

  async stopMusic(fadeMs: number): Promise<void> {
    this.stopMusicCalls.push(fadeMs);
  }

  async stopSound(channel: string, fadeMs: number): Promise<void> {
    this.stopSoundCalls.push({ channel, fadeMs });
  }

  destroy(): void {}
}

export function createContext(script: readonly string[]): Context {
  return {
    audioVariables: {
      m: "sound_beta_2/avg/m",
      s: "sound_beta_2/avg/s",
    },
    linkMap: {
      avg_npc_1: {
        array: [{ alias: "", group: -1, image: "avg_npc_1/1$1", name: "1$1" }],
        groups: [],
        pos: { x: 0, y: 100 },
        size: { x: 100, y: 100 },
      },
      avg_1012_skadisp_1: {
        array: [
          {
            alias: "",
            group: -1,
            image: "avg_1012_skadisp_1/avg_1012_skadisp_1",
            name: "avg_1012_skadisp_1",
          },
          {
            alias: "",
            group: -1,
            image: "avg_1012_skadisp_1/avg_1012_skadisp_2",
            name: "avg_1012_skadisp_2",
          },
        ],
        groups: [],
        pos: { x: 0, y: 175 },
        size: { x: 1150, y: 1150 },
      },
    },
    script,
  };
}
