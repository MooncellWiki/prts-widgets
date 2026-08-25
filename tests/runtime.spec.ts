import { describe, expect, it, vi } from "vitest";

import { StoryRuntime } from "../src/widgets/StoryPlayer/engine/runtime";

import type { Context } from "../src/widgets/StoryPlayer/context";
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
  InterludeInput,
  LargeBackgroundTweenInput,
  PlayMusicInput,
  PlaySoundInput,
  RuntimeWarning,
  ShowItemInput,
  SpellStickerInput,
  StickerInput,
  StoryAudio,
  StoryRenderer,
  SubtitleInput,
  TimerClearInput,
  TimerStickerInput,
} from "../src/widgets/StoryPlayer/engine/types";

class FakeRenderer implements StoryRenderer {
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
  imageRotateCalls: ImageRotateInput[] = [];
  interludeCalls: InterludeInput[] = [];
  largeBackgroundTweenCalls: LargeBackgroundTweenInput[] = [];
  largeImageTweenCalls: LargeBackgroundTweenInput[] = [];
  lastDialogue = { speaker: "", text: "" };
  dialogueTexts: string[] = [];
  showItemCalls: ShowItemInput[] = [];
  stickerCalls: StickerInput[] = [];
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

  clearCharacterCutin(_widgetId?: string): Promise<void> {
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

  async setImage(): Promise<void> {}
  async setImageRotate(input: ImageRotateInput): Promise<void> {
    this.imageRotateCalls.push(input);
  }

  async setImageTween(): Promise<void> {}
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
  }

  setSpellSticker(input: SpellStickerInput): void {
    this.spellStickerCalls.push(input);
  }

  async setSubtitle(input: SubtitleInput): Promise<void> {
    this.subtitleCalls.push(input);
    this.typingActive = input.delayMs > 0;
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

class FakeAudio implements StoryAudio {
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

function createContext(script: readonly string[]): Context {
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

describe("StoryRuntime", () => {
  it("maps spellsticker parameters and hides the blocking view before advancing", async () => {
    const renderer = new FakeRenderer();
    const runtime = new StoryRuntime(
      createContext([
        '[spellsticker(id="spell1",style="SAMI",x=-130,y=0,xScale=1.3,yScale=1.2,angle=5,alpha=2,block=true)]<p=1>主</><p=2>副</>',
        '[name="A"]after',
      ]),
      renderer,
      new FakeAudio(),
    );

    await runtime.start();
    expect(runtime.getState()).toBe("waiting_input");
    expect(renderer.spellStickerCalls).toEqual([
      {
        alpha: 1,
        angle: 5,
        content: "<p=1>主</><p=2>副</>",
        id: "spell1",
        style: "SAMI",
        x: -130,
        xScale: 1.3,
        y: 0,
        yScale: 1.2,
      },
    ]);

    await runtime.advance();
    expect(renderer.spellStickerHideCalls).toEqual(["spell1"]);
    expect(renderer.lastDialogue).toEqual({ speaker: "A", text: "after" });
  });

  it("keeps spellstickerclear independent and honors block", async () => {
    const renderer = new FakeRenderer();
    const runtime = new StoryRuntime(
      createContext(["[spellstickerclear(block=true)]", '[name="A"]after']),
      renderer,
      new FakeAudio(),
    );

    await runtime.start();
    expect(renderer.spellStickerClearCount).toBe(1);
    expect(renderer.stickersClearCalls).toEqual([]);
    expect(runtime.getState()).toBe("waiting_input");
    await runtime.advance();
    expect(renderer.lastDialogue).toEqual({ speaker: "A", text: "after" });
  });

  it("clears spellstickers when skipping the story", async () => {
    const renderer = new FakeRenderer();
    const runtime = new StoryRuntime(
      createContext([
        '[spellsticker(id="s",block=true)]<p=1>x</>',
        '[skipnode(mode="skip")]',
      ]),
      renderer,
      new FakeAudio(),
    );
    await runtime.start();
    await runtime.skipNode();
    expect(renderer.spellStickerClearCount).toBe(1);
    expect(renderer.spellStickerHideCalls).toEqual([]);
  });

  it("maps animtext prefab parameters and content without honoring ghost parameters", async () => {
    const renderer = new FakeRenderer();
    const runtime = new StoryRuntime(
      createContext([
        '[animtext(id="at1",name="group_location_stamp",style="avg_both",pos="-400,-200",block=false,duration=9,type="effect",clear=true)]<p=1>地点</><p=2>时间</>',
      ]),
      renderer,
      new FakeAudio(),
    );

    await runtime.start();

    expect(renderer.animTextCalls).toEqual([
      {
        block: false,
        content: "<p=1>地点</><p=2>时间</>",
        id: "at1",
        name: "group_location_stamp",
        position: { x: -400, y: -200 },
        style: "avg_both",
      },
    ]);
  });

  it("maps avgdisplay lifecycle and strict feature parameters", async () => {
    const renderer = new FakeRenderer();
    const runtime = new StoryRuntime(
      createContext([
        '[avgdisplay(id="1",name="bg_black",style="bg",slot="bgover",layer=2,afrom=0,ato=0.6,duration=2,isblock=true)]',
        '[avgdisplay(id="2",name="act3mainss_01",style="animekv",slot="cgover",x=-200,y=80,scalex=1.2,scaley=1.2,entryfrom=0,entryto=0.2,duration=5,block=true)]',
        '[avgdisplay(id="1")]',
      ]),
      renderer,
      new FakeAudio(),
    );

    await runtime.start();

    expect(renderer.avgDisplayCalls).toEqual([
      expect.objectContaining({
        alphaFrom: 0,
        alphaTo: 0.6,
        block: false,
        durationMs: 2000,
        id: "1",
        layer: 2,
        name: "bg_black",
        slot: "bgover",
        style: "bg",
      }),
      expect.objectContaining({
        block: true,
        durationMs: 5000,
        entryFrom: 0,
        entryTo: 0.2,
        id: "2",
        name: "act3mainss_01",
        scaleX: 1.2,
        scaleY: 1.2,
        slot: "cgover",
        style: "animekv",
        x: -200,
        y: 80,
      }),
      expect.objectContaining({
        block: false,
        id: "1",
        name: "",
      }),
    ]);
  });

  it("enters waiting_input on first dialogue", async () => {
    const renderer = new FakeRenderer();
    const runtime = new StoryRuntime(
      createContext(["[dialog]", '[name="A"]hello']),
      renderer,
      new FakeAudio(),
    );

    await runtime.start();

    expect(runtime.getState()).toBe("waiting_input");
    expect(renderer.lastDialogue).toEqual({ speaker: "A", text: "hello" });
  });

  it("runs delay with provided sleep handler", async () => {
    const sleep = vi.fn(async () => {});
    const runtime = new StoryRuntime(
      createContext(["[Delay(time=1)]", '[name="A"]done']),
      new FakeRenderer(),
      new FakeAudio(),
      { sleep },
    );

    await runtime.start();

    expect(sleep).toHaveBeenCalledWith(1000);
    expect(runtime.getState()).toBe("waiting_input");
  });

  it("scales delay once by animateRatio and yields a frame for zero", async () => {
    const sleep = vi.fn(async () => {});
    const runtime = new StoryRuntime(
      createContext(["[delay(time=2)]", "[delay(time=0)]", '[name="A"]done']),
      new FakeRenderer(),
      new FakeAudio(),
      { animateRatio: 0.25, sleep },
    );

    await runtime.start();

    expect(sleep).toHaveBeenNthCalledWith(1, 500);
    expect(sleep).toHaveBeenNthCalledWith(2, 0);
  });

  it("uses value predicates without treating them as label jumps", async () => {
    const renderer = new FakeRenderer();
    renderer.decisionValue = 2;
    renderer.decisionIndex = 1;
    const runtime = new StoryRuntime(
      createContext([
        '[decision(options="left;right",values="1;2")]',
        '[predicate(references="1")]',
        '[showitem(image="left")]',
        '[predicate(references="2")]',
        '[showitem(image="right")]',
        '[predicate(references="1;2")]',
        '[name="A"]merged',
      ]),
      renderer,
      new FakeAudio(),
    );

    await runtime.start();

    expect(renderer.showItemCalls.map((call) => call.key)).toEqual(["right"]);
    expect(renderer.lastDialogue).toEqual({ speaker: "A", text: "merged" });
  });

  it("uses native defaults for bare theater and restores manual input on exit", async () => {
    vi.useFakeTimers();
    try {
      const renderer = new FakeRenderer();
      const runtime = new StoryRuntime(
        createContext([
          "[theater]",
          '[name="A"]auto',
          "[theater(mode=false)]",
          '[name="B"]manual',
        ]),
        renderer,
        new FakeAudio(),
      );

      const start = runtime.start();
      await vi.advanceTimersByTimeAsync(1820);
      await start;

      expect(runtime.getState()).toBe("waiting_input");
      expect(renderer.lastDialogue).toEqual({ speaker: "B", text: "manual" });
    } finally {
      vi.useRealTimers();
    }
  });

  it("auto-advances after the native button-auto delay and stops at endtip", async () => {
    vi.useFakeTimers();
    try {
      const renderer = new FakeRenderer();
      const runtime = new StoryRuntime(
        createContext(['[name="A"]hi', '[name="B"]next']),
        renderer,
        new FakeAudio(),
      );

      await runtime.start();
      runtime.setAutoPlayMode("button_auto");
      expect(runtime.getAutoPlayState().mode).toBe("button_auto");

      await vi.advanceTimersByTimeAsync(1560);
      await vi.advanceTimersByTimeAsync(200);
      expect(renderer.lastDialogue).toEqual({ speaker: "B", text: "next" });

      await vi.advanceTimersByTimeAsync(1620);
      expect(runtime.getAutoPlayState().mode).toBe("default");
      expect(runtime.getState()).toBe("waiting_input");
    } finally {
      vi.useRealTimers();
    }
  });

  it("uses the selected auto speed and manual input disables auto mode", async () => {
    vi.useFakeTimers();
    try {
      const renderer = new FakeRenderer();
      const runtime = new StoryRuntime(
        createContext(['[name="A"]abcd', '[name="B"]next']),
        renderer,
        new FakeAudio(),
      );

      await runtime.start();
      runtime.setAutoPlayMode("button_auto");
      runtime.setAutoPlaySpeedLevel(1);
      expect(runtime.getAutoPlayState().buttonSpeedLevel).toBe(1);

      await vi.advanceTimersByTimeAsync(559);
      expect(renderer.lastDialogue).toEqual({ speaker: "A", text: "abcd" });
      await vi.advanceTimersByTimeAsync(1);
      await vi.advanceTimersByTimeAsync(50);
      expect(renderer.lastDialogue).toEqual({ speaker: "B", text: "next" });

      await runtime.advance();
      expect(runtime.getAutoPlayState().mode).toBe("default");
    } finally {
      vi.useRealTimers();
    }
  });

  it("quick mode emits an immediate click and uses its own speed level", async () => {
    vi.useFakeTimers();
    try {
      const renderer = new FakeRenderer();
      const runtime = new StoryRuntime(
        createContext(['[name="A"]first', '[name="B"]second']),
        renderer,
        new FakeAudio(),
      );

      await runtime.start();
      runtime.setAutoPlayMode("quick_play");
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(70);
      expect(renderer.lastDialogue).toEqual({ speaker: "B", text: "second" });

      runtime.setAutoPlaySpeedLevel(3);
      expect(runtime.getAutoPlayState()).toMatchObject({
        mode: "quick_play",
        quickSpeedLevel: 3,
      });
      await vi.advanceTimersByTimeAsync(25);
      expect(runtime.getAutoPlayState().mode).toBe("default");
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not run normal commands for video-only story metadata", async () => {
    const renderer = new FakeRenderer();
    const context = createContext(['[video(res="video/entry.mp4")]']);
    context.storyMetadata = {
      args: { is_video_only: true },
      characterSortType: "BY_GAIN_TIME_DOWN",
      denyAutoSwitchScene: false,
      dontClearGameObjectPoolOnStart: false,
      fitMode: "DEFAULT",
      id: "",
      isAutoable: false,
      isSkippable: true,
      isTutorial: false,
      isVideoOnly: true,
      title: "",
    };
    const runtime = new StoryRuntime(context, renderer, new FakeAudio());

    await runtime.start();

    expect(runtime.getState()).toBe("finished");
    expect(renderer.videoCalls).toEqual([]);
  });

  it("rejects showitem styles the panel does not register", async () => {
    const renderer = new FakeRenderer();
    const warnings: RuntimeWarning[] = [];
    const runtime = new StoryRuntime(
      createContext(['[ShowItem(image="item_a",style="cg")]', '[name="A"]ok']),
      renderer,
      new FakeAudio(),
      { onWarning: (warning) => warnings.push(warning) },
    );

    await runtime.start();

    // _slotStyles has only photo and cutin, so `cg` misses _FindSlotStyle and
    // the command finishes without rendering anything.
    expect(renderer.showItemCalls).toEqual([]);
    expect(warnings).toEqual([
      expect.objectContaining({
        command: "showitem",
        detail: "showitem style is not registered: cg",
        type: "invalid_parameter",
      }),
    ]);
  });

  it("treats a bracketed key=value tag as an empty dialog line", async () => {
    const renderer = new FakeRenderer();
    const warnings: RuntimeWarning[] = [];
    const runtime = new StoryRuntime(
      createContext(["[Delay=2]", '[name="A"]ok']),
      renderer,
      new FakeAudio(),
      { onWarning: (warning) => warnings.push(warning) },
    );

    await runtime.start();

    // `[Delay=2]` matches the parser's group-4 fallback, so it becomes a dialog
    // command with param {Delay: 2} and no content -- which hides the box and
    // returns false. It is not the delay command and it does not pause.
    expect(warnings).toEqual([]);
    expect(renderer.lastDialogue).toEqual({ speaker: "A", text: "ok" });
    expect(runtime.getState()).toBe("waiting_input");
  });

  it("skips endtip entirely in manual mode", async () => {
    const renderer = new FakeRenderer();
    const runtime = new StoryRuntime(
      createContext(['[name="A"]ok', "[endtip]tip"]),
      renderer,
      new FakeAudio(),
    );

    await runtime.start();
    await runtime.advance();

    // shouldProcessEndtip is false unless button-auto or quick-play is running,
    // and a click drops back to manual mode anyway, so the executor returns
    // without touching the dialog box and the story ends.
    expect(runtime.getState()).toBe("finished");
    expect(renderer.lastDialogue).toEqual({ speaker: "A", text: "ok" });
  });

  it("plays a video whose res carries no .mp4 extension", async () => {
    const renderer = new FakeRenderer();
    const warnings: RuntimeWarning[] = [];
    const runtime = new StoryRuntime(
      createContext(['[video(res="video/act15side/IW01")]', '[name="A"]after']),
      renderer,
      new FakeAudio(),
      { onWarning: (warning) => warnings.push(warning) },
    );

    const startPromise = runtime.start();
    await Promise.resolve();

    // IsMp4VideoPath has no call sites; the extension gates nothing.
    expect(renderer.videoCalls).toEqual([
      "https://torappu.prts.wiki/assets/video/act15side/iw01",
    ]);
    expect(warnings).toEqual([]);

    renderer.finishVideo();
    await startPromise;
  });

  it("prefers url over res and warns when neither is given", async () => {
    const renderer = new FakeRenderer();
    const warnings: RuntimeWarning[] = [];
    const runtime = new StoryRuntime(
      createContext(["[video]", '[name="A"]after']),
      renderer,
      new FakeAudio(),
      { onWarning: (warning) => warnings.push(warning) },
    );

    await runtime.start();

    expect(renderer.videoCalls).toEqual([]);
    expect(warnings).toEqual([
      expect.objectContaining({
        detail: "video: no url or res",
        type: "invalid_parameter",
      }),
    ]);
  });

  it("warns and skips unsupported command", async () => {
    const warnings: RuntimeWarning[] = [];
    const runtime = new StoryRuntime(
      createContext(['[bgeffect(name="$eb_blackmask")]', '[name="A"]ok']),
      new FakeRenderer(),
      new FakeAudio(),
      {
        onWarning: (warning) => warnings.push(warning),
      },
    );

    await runtime.start();

    expect(runtime.getState()).toBe("waiting_input");
    expect(warnings.some((item) => item.type === "unsupported_command")).toBe(
      true,
    );
  });

  it("blocks on video command until playback completes", async () => {
    const renderer = new FakeRenderer();
    const runtime = new StoryRuntime(
      createContext([
        '[video(res="video/act15side/IW01.mp4")]',
        '[name="A"]after',
      ]),
      renderer,
      new FakeAudio(),
    );

    const startPromise = runtime.start();

    await Promise.resolve();

    expect(runtime.getState()).toBe("waiting_video");
    expect(renderer.videoCalls).toEqual([
      "https://torappu.prts.wiki/assets/video/act15side/iw01.mp4",
    ]);

    renderer.finishVideo();
    await startPromise;

    expect(runtime.getState()).toBe("waiting_input");
    expect(renderer.lastDialogue).toEqual({ speaker: "A", text: "after" });
  });

  it("nofirstskip handles first-read skip by jumping to the next protected anchor", async () => {
    const sleep = vi.fn(() => new Promise<void>(() => {}));
    const renderer = new FakeRenderer();
    const runtime = new StoryRuntime(
      createContext([
        "[delay(time=30)]",
        '[skipnode(mode="nofirstskip")]',
        '[showitem(image="avg_npc_1",x=10,y=20)]',
        '[skipnode(mode="skip")]',
        '[name="A"]ok',
      ]),
      renderer,
      new FakeAudio(),
      { sleep },
    );

    const startPromise = runtime.start();

    await Promise.resolve();

    expect(runtime.getState()).toBe("waiting_timer");
    expect(runtime.canSkipNode()).toBe(true);
    expect(sleep).toHaveBeenCalledWith(30_000);

    await runtime.skipNode();
    await startPromise;
    expect(runtime.getState()).toBe("waiting_input");
    expect(renderer.lastDialogue).toEqual({ speaker: "A", text: "ok" });
  });

  it("does not lose the active process loop while skip cleanup is asynchronous", async () => {
    let finishCleanup!: () => void;
    const cleanup = new Promise<void>((resolve) => {
      finishCleanup = resolve;
    });
    const sleep = vi.fn(() => new Promise<void>(() => {}));
    const renderer = new FakeRenderer();
    vi.spyOn(renderer, "clearInterludes").mockReturnValue(cleanup);
    const runtime = new StoryRuntime(
      createContext([
        "[delay(time=30)]",
        '[skipnode(mode="nofirstskip")]',
        '[name="A"]after',
      ]),
      renderer,
      new FakeAudio(),
      { sleep },
    );

    const startPromise = runtime.start();
    await Promise.resolve();
    const skipPromise = runtime.skipNode();
    await Promise.resolve();

    expect(runtime.getState()).toBe("waiting_timer");
    finishCleanup();
    await skipPromise;
    await startPromise;

    expect(runtime.getState()).toBe("waiting_input");
    expect(renderer.lastDialogue).toEqual({ speaker: "A", text: "after" });
  });

  it("nofirstskip permits skip after the story has been read", async () => {
    const renderer = new FakeRenderer();
    const runtime = new StoryRuntime(
      createContext([
        '[skipnode(mode="nofirstskip")]',
        '[video(res="video/02.mp4")]',
        '[skipnode(mode="skip")]',
        '[name="A"]ok',
      ]),
      renderer,
      new FakeAudio(),
      { firstRead: false },
    );

    const startPromise = runtime.start();

    await Promise.resolve();

    expect(runtime.getState()).toBe("waiting_video");
    expect(runtime.canSkipNode()).toBe(true);

    await runtime.skipNode();
    await startPromise;

    expect(renderer.videoStopped).toBe(true);
    expect(runtime.getState()).toBe("finished");
    expect(runtime.canSkipNode()).toBe(false);
  });

  it("maps unrecognized skipnode modes to can-skip like native CalSkipMode", async () => {
    const warnings: RuntimeWarning[] = [];
    const runtime = new StoryRuntime(
      createContext(['[skipnode(mode="later")]', '[name="A"]ok']),
      new FakeRenderer(),
      new FakeAudio(),
      {
        onWarning: (warning) => warnings.push(warning),
      },
    );

    await runtime.start();

    expect(warnings).toEqual([]);
    expect(runtime.canSkipNode()).toBe(true);
    expect(runtime.getState()).toBe("waiting_input");
  });

  it("supports multiline command as dialogue wait", async () => {
    const renderer = new FakeRenderer();
    const runtime = new StoryRuntime(
      createContext(['[multiline(name="A")]line1']),
      renderer,
      new FakeAudio(),
    );

    await runtime.start();

    expect(runtime.getState()).toBe("waiting_input");
    expect(renderer.lastDialogue).toEqual({ speaker: "A", text: "line1" });
  });

  it("exposes the displayed line index and decision selection for logAll highlighting", async () => {
    const renderer = new FakeRenderer();
    renderer.decisionValue = 2;
    renderer.decisionIndex = 1;
    const runtime = new StoryRuntime(
      createContext([
        '[name="A"]第一句', // line 1 → 显示中
        '[name=""]', // line 2 空对白，不更新显示行
        '[decision(options="A;B", values="1;2")]', // line 3
        '[predicate(references="1")]', // line 4
        '[name="A路"]', // line 5 (被 decisionSelectValue=2 过滤掉)
        '[predicate(references="2")]', // line 6
        '[multiline(name="B")]合并', // line 7 → 显示中
      ]),
      renderer,
      new FakeAudio(),
    );

    // 初始无显示
    expect(runtime.getDisplayedLineIndex()).toBeNull();
    expect(runtime.getDecisionSelectValue()).toBe(0);

    // 停在第一句对白
    await runtime.start();
    expect(runtime.getState()).toBe("waiting_input");
    expect(runtime.getDisplayedLineIndex()).toBe(1);

    // 推进过空对白 + decision（玩家选 2）+ predicate 过滤，停在 multiline
    await runtime.advance();
    expect(runtime.getState()).toBe("waiting_input");
    expect(runtime.getDecisionSelectValue()).toBe(2);
    expect(runtime.getDisplayedLineIndex()).toBe(7);
    expect(renderer.lastDialogue).toEqual({ speaker: "B", text: "合并" });

    // 选择历史以 decisionId（源行号）+ optionIndex 记录，供 Log All 路径求值
    expect(runtime.getLogPosition()).toEqual({
      lineIndex: 7,
      selections: [{ decisionId: 3, optionIndex: 1, value: 2 }],
    });
  });

  it("keeps the clicked option index when option values collide", async () => {
    const renderer = new FakeRenderer();
    // values="2;2"：显式值重复；values="2"：第 2 项落到缺省值 0。
    // 两种情况下 value 都无法唯一反查下标，但点击的是第 2 项。
    renderer.decisionValue = 2;
    renderer.decisionIndex = 1;
    const runtime = new StoryRuntime(
      createContext([
        '[decision(options="A1;B1", values="2;2")]', // line 1
        '[decision(options="A2;B2", values="2")]', // line 2
        '[name="A"]done', // line 3
      ]),
      renderer,
      new FakeAudio(),
    );

    await runtime.start();

    expect(runtime.getDecisionSelectValue()).toBe(2);
    expect(runtime.getLogPosition()).toEqual({
      lineIndex: 3,
      selections: [
        { decisionId: 1, optionIndex: 1, value: 2 },
        { decisionId: 2, optionIndex: 1, value: 2 },
      ],
    });
  });

  it("resolves decision values through the shared semantics", async () => {
    const renderer = new FakeRenderer();
    renderer.decisionIndex = 1;
    renderer.decisionValue = 0;
    const runtime = new StoryRuntime(
      createContext([
        '[decision(options="A;B;C", values="7")]', // line 1，只有 A 有显式值
        '[predicate(references="7")]', // line 2
        '[name="A"]只有选 A 才看得到', // line 3
      ]),
      renderer,
      new FakeAudio(),
    );

    await runtime.start();

    // 面板拿到的是 log/semantics.parseDecision 逐项解析好的 values；
    // 缺项取 0，与原生 DecisionPanel._GetOptionValue 越界分支一致
    expect(renderer.decisionCalls[0]).toEqual({
      options: ["A", "B", "C"],
      values: [7, 0, 0],
    });
  });

  it("does not record a choice when the panel is cleared without a click", async () => {
    const renderer = new FakeRenderer();
    // optionIndex=-1：面板被销毁/顶替，玩家没点过；此时闸门值仍是 0
    renderer.decisionIndex = -1;
    renderer.decisionValue = 0;
    const runtime = new StoryRuntime(
      createContext([
        '[decision(options="A;B", values="1;2")]', // line 1
        '[name="A"]继续', // line 2
      ]),
      renderer,
      new FakeAudio(),
    );

    await runtime.start();

    expect(runtime.getLogPosition().selections).toEqual([]);
  });

  it("shows and hides story items with legacy defaults", async () => {
    const renderer = new FakeRenderer();
    const warnings: RuntimeWarning[] = [];
    const runtime = new StoryRuntime(
      createContext([
        '[showitem(image="item_act12side_1")]',
        "[hideitem]",
        '[name="Tips"]ok',
      ]),
      renderer,
      new FakeAudio(),
      {
        onWarning: (warning) => warnings.push(warning),
      },
    );

    await runtime.start();

    // The photo slot's serialized defaults: _defaultFadeTime 0.5 and
    // _defaultBlackAlpha 0.4, with offsetx/offsety hardcoded to 0.
    expect(renderer.showItemCalls).toEqual([
      {
        blackAlpha: 0.4,
        block: true,
        fadeMs: 500,
        key: "item_act12side_1",
        offsetX: 0,
        offsetY: 0,
      },
    ]);
    // hideitem does not read `block` either: it blocks whenever a slot was in
    // use, which it is here because the preceding showitem filled it.
    expect(renderer.clearItemsCalls).toEqual([{ block: true, fadeMs: 500 }]);
    expect(warnings).toEqual([]);
    expect(runtime.getState()).toBe("waiting_input");
  });

  it("places a single character in the middle slot without ever blocking", async () => {
    const renderer = new FakeRenderer();
    const sleep = vi.fn(async () => {});
    const runtime = new StoryRuntime(
      createContext([
        '[character(name="avg_npc_1",block=true,fadetime=0.2,enter="left",blackstart=0.2,blackend=0.8)]',
        '[name="A"]ok',
      ]),
      renderer,
      new FakeAudio(),
      { sleep },
    );

    await runtime.start();

    expect(renderer.clearedSlots).toEqual([
      { fadeMs: 200, slot: "l" },
      { fadeMs: 200, slot: "r" },
    ]);
    // `block` is not a key _ExecuteCharacter reads (it reads `isblock`), and the
    // executor never registers a completion callback, so the command never waits.
    expect(renderer.characterCalls).toEqual([
      {
        absolutePosition: { x: undefined, y: undefined },
        blackEnd: 0.8,
        blackStart: 0.2,
        block: false,
        characterKey: "avg_npc_1",
        dimmed: false,
        durationMs: 200,
        enterFrom: "left",
        expression: "1$1",
        fadeIdentity: "avg_npc_1",
        slot: "m",
      },
    ]);
    expect(sleep).not.toHaveBeenCalledWith(200);
    expect(runtime.getState()).toBe("waiting_input");
  });

  it("maps dual character layout and focus", async () => {
    const renderer = new FakeRenderer();
    const runtime = new StoryRuntime(
      createContext([
        '[character(name="avg_npc_1",name2="avg_npc_1#1",focus=1)]',
        '[name="A"]ok',
      ]),
      renderer,
      new FakeAudio(),
    );

    await runtime.start();

    expect(renderer.clearedSlots).toEqual([{ fadeMs: 150, slot: "m" }]);
    expect(renderer.characterCalls).toEqual([
      {
        absolutePosition: { x: undefined, y: undefined },
        blackEnd: Number.NaN,
        blackStart: Number.NaN,
        block: false,
        characterKey: "avg_npc_1",
        dimmed: false,
        durationMs: 150,
        enterFrom: undefined,
        expression: "1$1",
        fadeIdentity: "avg_npc_1",
        slot: "l",
      },
      {
        absolutePosition: { x: undefined, y: undefined },
        blackEnd: Number.NaN,
        blackStart: Number.NaN,
        block: false,
        characterKey: "avg_npc_1",
        dimmed: true,
        durationMs: 150,
        enterFrom: undefined,
        expression: "1$1",
        fadeIdentity: "avg_npc_1",
        slot: "r",
      },
    ]);
    expect(runtime.getState()).toBe("waiting_input");
  });

  it("keeps name2 in the right slot when the primary name is empty", async () => {
    const renderer = new FakeRenderer();
    const runtime = new StoryRuntime(
      createContext(['[character(name2="avg_npc_1#1")]', '[name="A"]ok']),
      renderer,
      new FakeAudio(),
    );

    await runtime.start();

    expect(renderer.clearedSlots).toEqual([
      { fadeMs: 150, slot: "l" },
      { fadeMs: 150, slot: "m" },
    ]);
    expect(renderer.characterCalls).toEqual([
      expect.objectContaining({
        characterKey: "avg_npc_1",
        expression: "1$1",
        slot: "r",
      }),
    ]);
  });

  it("uses exact character parameter keys and explicit positions", async () => {
    const renderer = new FakeRenderer();
    const runtime = new StoryRuntime(
      createContext([
        '[character(name="avg_npc_1",Name2="avg_npc_1",xpos1=123,ypos1=456)]',
        '[name="A"]ok',
      ]),
      renderer,
      new FakeAudio(),
    );

    await runtime.start();

    expect(renderer.characterCalls).toHaveLength(1);
    expect(renderer.characterCalls[0]).toMatchObject({
      absolutePosition: { x: 123, y: 456 },
      slot: "m",
    });
    expect(renderer.clearedSlots).toEqual([
      { fadeMs: 150, slot: "l" },
      { fadeMs: 150, slot: "r" },
    ]);
  });

  it("requires the case-sensitive charactercutin widgetID key", async () => {
    const renderer = new FakeRenderer();
    const warnings: RuntimeWarning[] = [];
    const runtime = new StoryRuntime(
      createContext([
        '[charactercutin(widgetid="wrong",name="avg_npc_1")]',
        '[charactercutin(widgetID="right",name="avg_npc_1",fadestyle="fade")]',
        '[name="A"]ok',
      ]),
      renderer,
      new FakeAudio(),
      { onWarning: (warning) => warnings.push(warning) },
    );

    await runtime.start();

    expect(renderer.characterCutinCalls).toHaveLength(1);
    expect(renderer.characterCutinCalls[0]).toMatchObject({
      fadeStyle: "fade",
      widgetId: "right",
    });
    expect(warnings).toEqual([
      expect.objectContaining({
        detail: "charactercutin widgetID is empty",
        type: "parse",
      }),
    ]);
  });

  it("maps interlude parameters and preserves the native channel default mismatch", async () => {
    const renderer = new FakeRenderer();
    const warnings: RuntimeWarning[] = [];
    const runtime = new StoryRuntime(
      createContext([
        '[interlude(channel=3,type=2,slot="m",name="bg_test",maskid="square",size="290,320",offset="10,-20",pfrom="1,2",pto="3,4",duration=2,sfrom="1,1",sto="2,2",sduration=1,afrom=0.2,ato=0.8,aduration=0.5,switch=true,block=true)]',
        "[interlude(clear=true)]",
        "[interlude(channel=-1,clear=true)]",
        '[name="A"]ok',
      ]),
      renderer,
      new FakeAudio(),
      { animateRatio: 0.5, onWarning: (warning) => warnings.push(warning) },
    );

    await runtime.start();

    expect(renderer.interludeCalls).toHaveLength(2);
    expect(renderer.interludeCalls[0]).toMatchObject({
      alphaDurationMs: 250,
      alphaFrom: 0.2,
      alphaTo: 0.8,
      block: true,
      channel: 3,
      durationMs: 1000,
      maskId: "square",
      offset: { x: 10, y: -20 },
      positionFrom: { x: 1, y: 2 },
      positionTo: { x: 3, y: 4 },
      scaleDurationMs: 500,
      scaleFrom: { x: 1, y: 1 },
      scaleTo: { x: 2, y: 2 },
      size: { x: 290, y: 320 },
      slot: "m",
      switchOn: true,
      type: 2,
    });
    expect(renderer.interludeCalls[1]).toMatchObject({
      channel: -1,
      clear: true,
    });
    expect(warnings).toEqual([
      expect.objectContaining({
        detail: "interlude channel is invalid: -1",
        type: "invalid_parameter",
      }),
    ]);
  });

  it("resolves uppercase character keys like legacy runtime", async () => {
    const renderer = new FakeRenderer();
    const runtime = new StoryRuntime(
      createContext([
        '[charslot(slot="m",name="avg_1012_skadiSP_1#2")]',
        '[name="A"]ok',
      ]),
      renderer,
      new FakeAudio(),
    );

    await runtime.start();

    expect(renderer.characterCalls).toEqual([
      {
        action: undefined,
        alphaFrom: undefined,
        alphaTo: undefined,
        blackEnd: undefined,
        blackStart: undefined,
        block: false,
        characterKey: "avg_1012_skadisp_1",
        // charslot's `duration` defaults to 0.0, not to DEFAULT_FADE_TIME.
        durationMs: 0,
        expression: "avg_1012_skadisp_2",
        fadeIdentity: "avg_1012_skadiSP_1",
        focusMode: "current_only",
        focusSlots: undefined,
        positionFrom: undefined,
        positionTo: undefined,
        posZoom: undefined,
        power: 0,
        preserveTransform: false,
        randomness: 90,
        replaceFadeMs: 0,
        resetTransform: true,
        scaleX: undefined,
        scaleY: undefined,
        slot: "m",
        stop: false,
        times: 1,
      },
    ]);
    expect(runtime.getState()).toBe("waiting_input");
  });

  it("resolves character refs with whitespace inside the suffix like native", async () => {
    const renderer = new FakeRenderer();
    const context = createContext([
      // One case per whitespace position the native Int32.TryParse tolerates:
      // between the index digits and `$`, after `#`, and after `$`.
      '[charslot(slot="m",name="avg_4236_tmslot_1#3 $1")]',
      '[charslot(slot="l",name="avg_npc_1# 1")]',
      '[charslot(slot="r",name="avg_4236_tmslot_1$ 1")]',
      '[name="A"]ok',
    ]);
    context.linkMap.avg_4236_tmslot_1 = {
      array: [
        { alias: "", group: 0, name: "1$1" },
        { alias: "", group: 0, name: "2$1" },
        { alias: "", group: 0, name: "3$1" },
      ],
      groups: [],
      pos: { x: 0, y: 0 },
      size: { x: 0, y: 0 },
    };
    const runtime = new StoryRuntime(context, renderer, new FakeAudio());

    await runtime.start();

    expect(renderer.characterCalls[0]).toMatchObject({
      characterKey: "avg_4236_tmslot_1",
      expression: "3$1",
      slot: "m",
    });
    expect(renderer.characterCalls[1]).toMatchObject({
      characterKey: "avg_npc_1",
      expression: "1$1",
      slot: "l",
    });
    expect(renderer.characterCalls[2]).toMatchObject({
      characterKey: "avg_4236_tmslot_1",
      expression: "1$1",
      slot: "r",
    });
    expect(runtime.getState()).toBe("waiting_input");
  });

  it("maps charslot slot aliases and duration blocking like legacy runtime", async () => {
    const renderer = new FakeRenderer();
    const runtime = new StoryRuntime(
      createContext([
        '[charslot(slot="left",name="avg_npc_1",duration=0.4,isblock=true)]',
        '[name="A"]ok',
      ]),
      renderer,
      new FakeAudio(),
    );

    await runtime.start();

    expect(renderer.characterCalls[0]).toMatchObject({
      block: true,
      durationMs: 400,
      focusMode: "current_only",
      slot: "l",
    });
    expect(runtime.getState()).toBe("waiting_input");
  });

  it("keeps charslot updates without name on the existing slot", async () => {
    const renderer = new FakeRenderer();
    const runtime = new StoryRuntime(
      createContext([
        '[charslot(slot="m",name="avg_npc_1")]',
        '[charslot(slot="middle",focus="none",posto="10,20",duration=0.2)]',
        '[name="A"]ok',
      ]),
      renderer,
      new FakeAudio(),
    );

    await runtime.start();

    expect(renderer.clearedSlots).toEqual([]);
    expect(renderer.characterCalls).toHaveLength(2);
    expect(renderer.characterCalls[1]).toMatchObject({
      characterKey: undefined,
      focusMode: "none",
      positionTo: { x: 10, y: 20 },
      slot: "m",
    });
  });

  it("clears all characters with charslot duration when slot is omitted", async () => {
    const renderer = new FakeRenderer();
    const runtime = new StoryRuntime(
      createContext(["[charslot(duration=0.5,isblock=true)]", '[name="A"]ok']),
      renderer,
      new FakeAudio(),
    );

    await runtime.start();

    expect(renderer.clearedSlots).toEqual([{ fadeMs: 500, slot: undefined }]);
    expect(runtime.getState()).toBe("waiting_input");
  });

  it("does not block on full-scene charslot clear unless explicitly requested", async () => {
    let resolveClear: (() => void) | undefined;
    const renderer = new FakeRenderer();
    renderer.clearCharactersHandler = () =>
      new Promise<void>((resolve) => {
        resolveClear = resolve;
      });
    const runtime = new StoryRuntime(
      createContext(["[charslot(duration=0.5)]", '[name="A"]ok']),
      renderer,
      new FakeAudio(),
    );

    const startPromise = runtime.start();

    await Promise.resolve();

    expect(runtime.getState()).toBe("waiting_input");

    resolveClear?.();
    await startPromise;
  });

  it("maps camerashake to native defaults and parameters", async () => {
    const renderer = new FakeRenderer();
    const runtime = new StoryRuntime(
      createContext([
        "[camerashake(xstrength=12,ystrength=8)]",
        "[camerashake(duration=0.5,randomness=40,vibrato=18,block=false,stop=true)]",
        '[name="A"]ok',
      ]),
      renderer,
      new FakeAudio(),
    );

    await runtime.start();

    expect(renderer.shakeCalls).toEqual([
      {
        block: false,
        durationMs: 10_000,
        fadeOut: false,
        infinite: true,
        randomness: 90,
        stop: false,
        vibrato: 10,
        xStrength: 12,
        yStrength: 8,
      },
      {
        block: false,
        durationMs: 500,
        fadeOut: false,
        infinite: false,
        randomness: 40,
        stop: true,
        vibrato: 18,
        xStrength: 1,
        yStrength: 0,
      },
    ]);
    expect(runtime.getState()).toBe("waiting_input");
  });

  it("maps blocker RGBA endpoints, styles, and native zero-duration blocking", async () => {
    const renderer = new FakeRenderer();
    const runtime = new StoryRuntime(
      createContext([
        '[blocker(a=1,r=255,g=128,b=0,afrom=0,rfrom=0,gfrom=0,bfrom=0,style=slider,inverse=true,fadetime=0,block=true,image="mask")]',
        '[name="A"]ok',
      ]),
      renderer,
      new FakeAudio(),
    );

    await runtime.start();

    expect(renderer.blockerCalls).toEqual([
      {
        block: false,
        fadeMs: 0,
        from: { a: 0, b: 0, g: 0, r: 0 },
        image: "mask",
        inverse: true,
        style: "slider",
        to: { a: 1, b: 0, g: 128, r: 255 },
      },
    ]);
  });

  it("keeps cameraeffect values case-sensitive and degrades Chaos structurally", async () => {
    const renderer = new FakeRenderer();
    const warnings: RuntimeWarning[] = [];
    const runtime = new StoryRuntime(
      createContext([
        "[cameraeffect(effect=Grayscale,initamount=0.2,amount=0.8,fadetime=0.5,block=true,keep=true)]",
        "[cameraeffect(effect=Colorinverse,keep=true,block=true)]",
        "[cameraeffect(effect=Chaos,keep=true)]",
        "[cameraeffect(effect=grayscale,amount=1)]",
        '[name="A"]ok',
      ]),
      renderer,
      new FakeAudio(),
      { onWarning: (warning) => warnings.push(warning) },
    );

    await runtime.start();

    expect(renderer.cameraEffectCalls).toEqual([
      {
        amount: 0.8,
        block: true,
        durationMs: 500,
        effect: "Grayscale",
        initialAmount: 0.2,
        keep: true,
      },
      {
        amount: 1,
        block: false,
        durationMs: 0,
        effect: "Colorinverse",
        initialAmount: undefined,
        keep: true,
      },
    ]);
    expect(warnings).toContainEqual(
      expect.objectContaining({
        detail: "cameraeffect:Chaos",
        type: "unsupported_visual",
      }),
    );
  });

  it("maps focusout duration, from and native blocking semantics without reading fadetime", async () => {
    const renderer = new FakeRenderer();
    const runtime = new StoryRuntime(
      createContext([
        '[focusout(duration=1.5,type="bg",from=0.25,to=1,block=true)]',
        '[focusout(type="cgitem",id="cgitem_61_i02",from=-1,to=0.5,block=true,fadetime=9)]',
        '[name="A"]ok',
      ]),
      renderer,
      new FakeAudio(),
    );

    await runtime.start();

    expect(renderer.focusOutCalls).toEqual([
      { block: true, durationMs: 1500, from: 0.25, id: "", to: 1, type: "bg" },
      {
        block: false,
        durationMs: 0,
        from: undefined,
        id: "cgitem_61_i02",
        to: 0.5,
        type: "cgitem",
      },
    ]);
  });

  it("maps focusparam defaults and keeps effect values case-sensitive", async () => {
    const renderer = new FakeRenderer();
    const runtime = new StoryRuntime(
      createContext([
        '[focusparam(effect="Grayscale",blur=false)]',
        '[focusparam(effect="Colorinverse")]',
        '[focusparam(effect="grayscale",blur=true)]',
        "[focusparam]",
        '[name="A"]ok',
      ]),
      renderer,
      new FakeAudio(),
    );

    await runtime.start();

    expect(renderer.focusParamCalls).toEqual([
      { blur: false, color: "Grayscale" },
      { blur: true, color: "Colorinverse" },
      { blur: true, color: "None" },
      { blur: true, color: "None" },
    ]);
  });

  it("maps curtain commands with native alpha and block args", async () => {
    const renderer = new FakeRenderer();
    const runtime = new StoryRuntime(
      createContext([
        "[curtain(direction=0,fillfrom=0.01,fillto=0.2,fadetime=1.5,isblock=true)]",
        "[curtain(direction=4,fillto=0.08,a=0.5,fadetime=0.25,block=true)]",
        '[name="A"]ok',
      ]),
      renderer,
      new FakeAudio(),
    );

    await runtime.start();

    expect(renderer.curtainCalls).toEqual([
      {
        alphaFrom: undefined,
        alphaTo: undefined,
        block: false,
        delayMs: 0,
        direction: 0,
        fadeMs: 1500,
        fillFrom: 0.01,
        fillTo: 0.2,
        grad: false,
      },
      {
        alphaFrom: undefined,
        alphaTo: 0.5,
        block: true,
        delayMs: 0,
        direction: 4,
        fadeMs: 250,
        fillFrom: 1,
        fillTo: 0.08,
        grad: false,
      },
    ]);
    expect(runtime.getState()).toBe("waiting_input");
  });

  it("ignores the non-native curtain ato key", async () => {
    const renderer = new FakeRenderer();
    const runtime = new StoryRuntime(
      createContext([
        "[curtain(direction=4,fillfrom=0.18,fillto=0.18,afrom=0,ato=1,fadetime=0.1,block=true)]",
        '[name="A"]ok',
      ]),
      renderer,
      new FakeAudio(),
    );

    await runtime.start();

    expect(renderer.curtainCalls).toEqual([
      {
        alphaFrom: 0,
        alphaTo: undefined,
        block: true,
        delayMs: 0,
        direction: 4,
        fadeMs: 100,
        fillFrom: 0.18,
        fillTo: 0.18,
        grad: false,
      },
    ]);
  });

  it("clears all curtains when direction is omitted", async () => {
    const renderer = new FakeRenderer();
    const runtime = new StoryRuntime(
      createContext(["[curtain(fadetime=0.3,block=true)]", '[name="A"]ok']),
      renderer,
      new FakeAudio(),
    );

    await runtime.start();

    // _HideAllCurtains returns a literal false from every exit, so the clear path
    // never blocks even when the script asks for it.
    expect(renderer.curtainClearCalls).toEqual([
      {
        block: false,
        fadeMs: 300,
      },
    ]);
    expect(renderer.curtainCalls).toEqual([]);
    expect(runtime.getState()).toBe("waiting_input");
  });

  it("scales curtain fadetime by animateRatio", async () => {
    const renderer = new FakeRenderer();
    const runtime = new StoryRuntime(
      createContext([
        "[curtain(direction=2,fillfrom=1,fillto=0,fadetime=1.5,block=true)]",
        '[name="A"]ok',
      ]),
      renderer,
      new FakeAudio(),
      { animateRatio: 0.5 },
    );

    await runtime.start();

    // _ExecuteCurtain inlines scaledFadetime = animateRatio * fadetime.
    expect(renderer.curtainCalls).toEqual([
      {
        alphaFrom: undefined,
        alphaTo: undefined,
        block: true,
        delayMs: 0,
        direction: 2,
        fadeMs: 750,
        fillFrom: 1,
        fillTo: 0,
        grad: false,
      },
    ]);
  });

  it("drops curtain blocking when animateRatio zeroes the fade", async () => {
    const renderer = new FakeRenderer();
    const runtime = new StoryRuntime(
      createContext([
        "[curtain(direction=0,fillfrom=1,fillto=0,fadetime=3,block=true)]",
        "[curtain(fadetime=2,block=true)]",
        '[name="A"]ok',
      ]),
      renderer,
      new FakeAudio(),
      { animateRatio: 0 },
    );

    await runtime.start();

    // quick_play (animateRatio 0) lands in the instant branches: the
    // closure's block field is zeroed for the single-side path, direction<0
    // returns literal false, and a fadetime=3 close can no longer stall the
    // fast-forward.
    expect(renderer.curtainCalls).toEqual([
      {
        alphaFrom: undefined,
        alphaTo: undefined,
        block: false,
        delayMs: 0,
        direction: 0,
        fadeMs: 0,
        fillFrom: 1,
        fillTo: 0,
        grad: false,
      },
    ]);
    expect(renderer.curtainClearCalls).toEqual([{ block: false, fadeMs: 0 }]);
    expect(runtime.getState()).toBe("waiting_input");
  });

  it("maps gridbg into a tiled background layer", async () => {
    const renderer = new FakeRenderer();
    const runtime = new StoryRuntime(
      createContext([
        '[gridbg(imagegroup="47_g14_skyovercast_L1/47_g14_skyovercast_R1/47_g14_skyovercast_L2/47_g14_skyovercast_R2",solidwidth="1280/1280",solidheight="720/720",x=-640,y=320,xScale=0.5,yScale=0.75,fadetime=1)]',
        '[name="A"]ok',
      ]),
      renderer,
      new FakeAudio(),
    );

    await runtime.start();

    expect(renderer.gridBackgroundCalls).toEqual([
      {
        assetKind: "background",
        block: false,
        fadeMs: 1000,
        imageKeys: [
          "47_g14_skyovercast_l1",
          "47_g14_skyovercast_r1",
          "47_g14_skyovercast_l2",
          "47_g14_skyovercast_r2",
        ],
        layout: "grid",
        scaleX: 0.5,
        scaleY: 0.75,
        solidHeights: [720, 720],
        solidWidths: [1280, 1280],
        x: -640,
        y: 320,
      },
    ]);
    expect(renderer.gridBackgroundClearCalls).toEqual([]);
    expect(runtime.getState()).toBe("waiting_input");
  });

  it("clears gridbg independently and supports legacy blok typo", async () => {
    const renderer = new FakeRenderer();
    const runtime = new StoryRuntime(
      createContext(["[gridbg(fadetime=2,block=true)]", '[name="A"]ok']),
      renderer,
      new FakeAudio(),
    );

    await runtime.start();

    expect(renderer.gridBackgroundCalls).toEqual([]);
    expect(renderer.gridBackgroundClearCalls).toEqual([
      {
        block: true,
        fadeMs: 2000,
      },
    ]);
    expect(runtime.getState()).toBe("waiting_input");
  });

  it("maps verticalbg into a vertically tiled composed background layer", async () => {
    const renderer = new FakeRenderer();
    const runtime = new StoryRuntime(
      createContext([
        '[verticalbg(imagegroup="66_i15_4/66_i15_3/66_i15_2/66_i15_1",solidwidth=1280,solidheight="720/720/720/625",y=540,xScale=0.9,yScale=0.9,fadetime=1)]',
        '[name="A"]ok',
      ]),
      renderer,
      new FakeAudio(),
    );

    await runtime.start();

    expect(renderer.gridBackgroundCalls).toEqual([
      {
        assetKind: "background",
        block: false,
        fadeMs: 1000,
        imageKeys: ["66_i15_4", "66_i15_3", "66_i15_2", "66_i15_1"],
        layout: "vertical",
        scaleX: 0.9,
        scaleY: 0.9,
        solidHeights: [720, 720, 720, 625],
        solidWidths: [1280],
        x: 0,
        y: 540,
      },
    ]);
    expect(renderer.gridBackgroundClearCalls).toEqual([]);
    expect(runtime.getState()).toBe("waiting_input");
  });

  it("supports verticalbg cggroup assets and comma-separated solid heights", async () => {
    const renderer = new FakeRenderer();
    const runtime = new StoryRuntime(
      createContext([
        '[verticalbg(cggroup="69_i12_1/69_i12_2",solidwidth="1600",solidheight="1,454/1,454",y=200,fadetime=0)]',
        '[name="A"]ok',
      ]),
      renderer,
      new FakeAudio(),
    );

    await runtime.start();

    expect(renderer.gridBackgroundCalls).toEqual([
      {
        assetKind: "image",
        block: false,
        fadeMs: 0,
        imageKeys: ["69_i12_1", "69_i12_2"],
        layout: "vertical",
        scaleX: 1,
        scaleY: 1,
        solidHeights: [1454, 1454],
        solidWidths: [1600],
        x: 0,
        y: 200,
      },
    ]);
  });

  it("prefers imagegroup assets when verticalbg also includes cggroup", async () => {
    const renderer = new FakeRenderer();
    const runtime = new StoryRuntime(
      createContext([
        '[verticalbg(imagegroup="47_g14_skyovercast_L1/47_g14_skyovercast_R1",cggroup="69_i12_1/69_i12_2",solidwidth=1280,solidheight="720/720",fadetime=0)]',
        '[name="A"]ok',
      ]),
      renderer,
      new FakeAudio(),
    );

    await runtime.start();

    expect(renderer.gridBackgroundCalls).toEqual([
      {
        assetKind: "background",
        block: false,
        fadeMs: 0,
        imageKeys: ["47_g14_skyovercast_l1", "47_g14_skyovercast_r1"],
        layout: "vertical",
        scaleX: 1,
        scaleY: 1,
        solidHeights: [720, 720],
        solidWidths: [1280],
        x: 0,
        y: 0,
      },
    ]);
  });

  it("clears verticalbg with fade parameters when no image group is provided", async () => {
    const renderer = new FakeRenderer();
    const runtime = new StoryRuntime(
      createContext(["[verticalbg(fadetime=3,block=true)]", '[name="A"]ok']),
      renderer,
      new FakeAudio(),
    );

    await runtime.start();

    expect(renderer.gridBackgroundCalls).toEqual([]);
    expect(renderer.gridBackgroundClearCalls).toEqual([
      {
        block: true,
        fadeMs: 3000,
      },
    ]);
  });

  it("maps largebg into a legacy large tiled background layer", async () => {
    const renderer = new FakeRenderer();
    const runtime = new StoryRuntime(
      createContext([
        '[largebg(imagegroup="bg_beach_1/bg_beach_2",solidwidth="920/920",solidheight="720",x=-180,fadetime=1)]',
        '[name="A"]ok',
      ]),
      renderer,
      new FakeAudio(),
    );

    await runtime.start();

    expect(renderer.gridBackgroundCalls).toEqual([
      {
        assetKind: "background",
        block: false,
        fadeMs: 1000,
        imageKeys: ["bg_beach_1", "bg_beach_2"],
        initPositionMode: "default",
        layout: "large",
        scaleX: 1,
        scaleY: 1,
        solidHeights: [720],
        solidWidths: [920, 920],
        x: -180,
        y: 0,
      },
    ]);
    expect(renderer.gridBackgroundClearCalls).toEqual([]);
    expect(runtime.getState()).toBe("waiting_input");
  });

  it("supports largebg cggroup assets and clear commands", async () => {
    const renderer = new FakeRenderer();
    const runtime = new StoryRuntime(
      createContext([
        '[largebg(cggroup="61_i12/61_i11",solidwidth="1600/1600",solidheight=900,x=-160,yScale=0.8,fadetime=0)]',
        "[largebg(fadetime=0.2,block=true)]",
        '[name="A"]ok',
      ]),
      renderer,
      new FakeAudio(),
    );

    await runtime.start();

    expect(renderer.gridBackgroundCalls).toEqual([
      {
        assetKind: "image",
        block: false,
        fadeMs: 0,
        imageKeys: ["61_i12", "61_i11"],
        initPositionMode: "default",
        layout: "large",
        scaleX: 1,
        scaleY: 0.8,
        solidHeights: [900],
        solidWidths: [1600, 1600],
        x: -160,
        y: 0,
      },
    ]);
    expect(renderer.gridBackgroundClearCalls).toEqual([
      {
        block: true,
        fadeMs: 200,
      },
    ]);
  });

  it("maps largeimg into a legacy large tiled image layer", async () => {
    const renderer = new FakeRenderer();
    const runtime = new StoryRuntime(
      createContext([
        '[largeimg(imagegroup="61_i12/61_i11",solidwidth="1600/1600",solidheight="900",x=-160,yscale=0.8,fadetime=0)]',
        '[name="A"]ok',
      ]),
      renderer,
      new FakeAudio(),
    );

    await runtime.start();

    expect(renderer.gridBackgroundCalls).toEqual([
      {
        assetKind: "image",
        block: false,
        fadeMs: 0,
        imageKeys: ["61_i12", "61_i11"],
        layout: "large",
        scaleX: 1,
        scaleY: 0.8,
        solidHeights: [900],
        solidWidths: [1600, 1600],
        x: -160,
        y: 0,
      },
    ]);
    expect(renderer.gridBackgroundClearCalls).toEqual([]);
  });

  it("clears largeimg with fade parameters when no image group is provided", async () => {
    const renderer = new FakeRenderer();
    const runtime = new StoryRuntime(
      createContext(["[largeimg(fadetime=0.2,blok=true)]", '[name="A"]ok']),
      renderer,
      new FakeAudio(),
    );

    await runtime.start();

    expect(renderer.gridBackgroundCalls).toEqual([]);
    expect(renderer.gridBackgroundClearCalls).toEqual([
      {
        block: true,
        fadeMs: 200,
      },
    ]);
  });

  it("maps characteraction move with legacy slot aliases and block args", async () => {
    const renderer = new FakeRenderer();
    const runtime = new StoryRuntime(
      createContext([
        '[characteraction(name="left",type="move",xpos=-200,ypos=60,fadetime=0.1,isblock=true)]',
        '[name="A"]ok',
      ]),
      renderer,
      new FakeAudio(),
    );

    await runtime.start();

    expect(renderer.actionCalls).toEqual([
      {
        block: true,
        direction: undefined,
        durationMs: 100,
        power: 0,
        randomness: 90,
        rotationFromDeg: 0,
        rotationLeftDeg: -15,
        rotationRightDeg: 15,
        scaleX: undefined,
        scaleY: undefined,
        slot: "l",
        stop: false,
        times: 1,
        type: "move",
        xOffset: -200,
        yOffset: 60,
      },
    ]);
    expect(runtime.getState()).toBe("waiting_input");
  });

  it("uses the five strict characteraction branches and native slot fallbacks", async () => {
    const renderer = new FakeRenderer();
    const runtime = new StoryRuntime(
      createContext([
        '[characteraction(name="middle",type="rotate",duration=0.5,start=3,leftend=20,rightend=10,times=-1,stop=false)]',
        '[characteraction(name="char_right",type="zoom",scale=1.2,yscale=0.8,block=true)]',
        '[characteraction(name="r",type="exit",direction="left",block=false)]',
        '[name="A"]ok',
      ]),
      renderer,
      new FakeAudio(),
    );

    await runtime.start();

    expect(renderer.actionCalls).toEqual([
      {
        block: true,
        direction: undefined,
        durationMs: 500,
        power: 0,
        randomness: 90,
        rotationFromDeg: 0,
        rotationLeftDeg: -15,
        rotationRightDeg: 15,
        scaleX: 1.2,
        scaleY: 0.8,
        slot: "l",
        stop: false,
        times: 1,
        type: "zoom",
        xOffset: 0,
        yOffset: 0,
      },
      {
        block: false,
        direction: "left",
        durationMs: 500,
        power: 0,
        randomness: 90,
        rotationFromDeg: 0,
        rotationLeftDeg: -15,
        rotationRightDeg: 15,
        scaleX: undefined,
        scaleY: undefined,
        slot: "m",
        stop: false,
        times: 1,
        type: "exit",
        xOffset: 0,
        yOffset: 0,
      },
    ]);
    expect(runtime.getState()).toBe("waiting_input");
  });

  it("maps imagerotate strict parameters", async () => {
    const renderer = new FakeRenderer();
    const runtime = new StoryRuntime(
      createContext([
        "[imagerotate(angle=-5,fadetime=0.1,block=true)]",
        '[imagerotate(angle=0,fadetime=10,isblock=false,image="70_i11")]',
        "[imagerotate]",
        '[name="A"]ok',
      ]),
      renderer,
      new FakeAudio(),
    );

    await runtime.start();

    expect(renderer.imageRotateCalls).toEqual([
      {
        angleDeg: -5,
        block: true,
        circles: 0,
        durationMs: 100,
        inverse: false,
      },
      {
        angleDeg: 0,
        block: false,
        circles: 0,
        durationMs: 10_000,
        inverse: false,
      },
      {
        angleDeg: 0,
        block: false,
        circles: 0,
        durationMs: 0,
        inverse: false,
      },
    ]);
    expect(runtime.getState()).toBe("waiting_input");
  });

  it("maps background with strict transform keys and ignores width/height", async () => {
    const renderer = new FakeRenderer();
    const runtime = new StoryRuntime(
      createContext([
        '[background(image="beach_1",x=24,y=-36,xScale=1.7,height=1.4)]',
        '[name="A"]ok',
      ]),
      renderer,
      new FakeAudio(),
    );

    await runtime.start();

    expect(renderer.backgroundCalls).toEqual([
      {
        input: {
          scaleX: 1.7,
          scaleY: 1,
          block: false,
          fadeMs: 0,
          screenAdapt: undefined,
          tiled: false,
          x: 24,
          y: -36,
        },
        key: "beach_1",
      },
    ]);
    expect(runtime.getState()).toBe("waiting_input");
  });

  it("maps backgroundtween with strict CamelCase keys", async () => {
    const renderer = new FakeRenderer();
    const runtime = new StoryRuntime(
      createContext([
        '[background(image="beach_1",x=24,y=-36,xScale=1.7,height=1.4)]',
        "[backgroundtween(xFrom=0,xTo=-720,duration=25,block=false)]",
        "[backgroundtween(duration=0.5,xScaleFrom=0.75,xScaleTo=0.8,yScaleFrom=0.75,yScaleTo=0.8)]",
        "[backgroundtween(y=360)]",
        "[backgroundtween(y=180,block=false)]",
        '[name="A"]ok',
      ]),
      renderer,
      new FakeAudio(),
    );

    await runtime.start();

    expect(renderer.backgroundTweenCalls).toEqual([
      {
        block: false,
        durationMs: 25_000,
        xFrom: 0,
        xScaleFrom: undefined,
        xScaleTo: undefined,
        xTo: -720,
        yFrom: undefined,
        yScaleFrom: undefined,
        yScaleTo: undefined,
        yTo: undefined,
      },
      {
        block: false,
        durationMs: 500,
        xFrom: undefined,
        xScaleFrom: 0.75,
        xScaleTo: 0.8,
        xTo: undefined,
        yFrom: undefined,
        yScaleFrom: 0.75,
        yScaleTo: 0.8,
        yTo: undefined,
      },
      // `duration` defaults to 0.0, and <= 0 completes both tweens immediately.
      {
        block: false,
        durationMs: 0,
        xFrom: undefined,
        xScaleFrom: undefined,
        xScaleTo: undefined,
        xTo: undefined,
        yFrom: undefined,
        yScaleFrom: undefined,
        yScaleTo: undefined,
        yTo: undefined,
      },
      {
        block: false,
        durationMs: 0,
        xFrom: undefined,
        xScaleFrom: undefined,
        xScaleTo: undefined,
        xTo: undefined,
        yFrom: undefined,
        yScaleFrom: undefined,
        yScaleTo: undefined,
        yTo: undefined,
      },
    ]);
    expect(runtime.getState()).toBe("waiting_input");
  });

  it("maps largebgtween with strict CamelCase keys", async () => {
    const renderer = new FakeRenderer();
    const runtime = new StoryRuntime(
      createContext([
        '[largebg(imagegroup="bg_beach_1/bg_beach_2",solidwidth="920/920",solidheight="720",x=-180,fadetime=0)]',
        '[largebgtween(xFrom=0,xTo=-720,duration=25,ease="1",block=false)]',
        "[largebgtween(duration=0.5,xScaleFrom=0.75,xScaleTo=0.8,yScaleFrom=0.75,yScaleTo=0.8)]",
        "[largebgtween(y=360,block=true)]",
        '[name="A"]ok',
      ]),
      renderer,
      new FakeAudio(),
    );

    await runtime.start();

    expect(renderer.largeBackgroundTweenCalls).toEqual([
      {
        block: false,
        durationMs: 25_000,
        xFrom: 0,
        xScaleFrom: undefined,
        xScaleTo: undefined,
        xTo: -720,
        yFrom: undefined,
        yScaleFrom: undefined,
        yScaleTo: undefined,
        yTo: undefined,
      },
      {
        block: false,
        durationMs: 500,
        xFrom: undefined,
        xScaleFrom: 0.75,
        xScaleTo: 0.8,
        xTo: undefined,
        yFrom: undefined,
        yScaleFrom: 0.75,
        yScaleTo: 0.8,
        yTo: undefined,
      },
      {
        block: false,
        durationMs: 0,
        xFrom: undefined,
        xScaleFrom: undefined,
        xScaleTo: undefined,
        xTo: undefined,
        yFrom: undefined,
        yScaleFrom: undefined,
        yScaleTo: undefined,
        yTo: undefined,
      },
    ]);
    expect(runtime.getState()).toBe("waiting_input");
  });

  it("maps largeimgtween with legacy aliases and current-transform fallbacks", async () => {
    const renderer = new FakeRenderer();
    const runtime = new StoryRuntime(
      createContext([
        '[largeimg(imagegroup="61_i12/61_i11",solidwidth="1600/1600",solidheight="900",x=-160,yscale=0.8,fadetime=0)]',
        "[largeimgtween(xFrom=0,xTo=-720,duration=25,block=false)]",
        "[largeimgtween(duration=0.5,xScaleFrom=0.75,xScaleTo=0.8,yScaleFrom=0.75,yScaleTo=0.8)]",
        "[largeimgtween(y=360,block=true)]",
        '[name="A"]ok',
      ]),
      renderer,
      new FakeAudio(),
    );

    await runtime.start();

    expect(renderer.largeImageTweenCalls).toEqual([
      {
        block: false,
        durationMs: 25_000,
        xFrom: 0,
        xScaleFrom: undefined,
        xScaleTo: undefined,
        xTo: -720,
        yFrom: undefined,
        yScaleFrom: undefined,
        yScaleTo: undefined,
        yTo: undefined,
      },
      {
        block: false,
        durationMs: 500,
        xFrom: undefined,
        xScaleFrom: 0.75,
        xScaleTo: 0.8,
        xTo: undefined,
        yFrom: undefined,
        yScaleFrom: 0.75,
        yScaleTo: 0.8,
        yTo: undefined,
      },
      {
        block: true,
        durationMs: 150,
        xFrom: undefined,
        xScaleFrom: undefined,
        xScaleTo: undefined,
        xTo: undefined,
        yFrom: 360,
        yScaleFrom: undefined,
        yScaleTo: undefined,
        yTo: 360,
      },
    ]);
    expect(runtime.getState()).toBe("waiting_input");
  });

  it("maps musicvolume and soundvolume commands", async () => {
    const audio = new FakeAudio();
    const runtime = new StoryRuntime(
      createContext([
        "[musicvolume(volume=0.25,fadetime=1.5)]",
        '[soundvolume(channel="b",volume=0.75,fadetime=0.5)]',
        '[name="A"]ok',
      ]),
      new FakeRenderer(),
      audio,
    );

    await runtime.start();

    expect(audio.musicVolumeCalls).toEqual([
      {
        fadeMs: 1500,
        volume: 0.25,
      },
    ]);
    expect(audio.soundVolumeCalls).toEqual([
      {
        channel: "b",
        fadeMs: 500,
        volume: 0.75,
      },
    ]);
    expect(runtime.getState()).toBe("waiting_input");
  });

  it("maps native audio defaults, exact parameter casing, and raw channels", async () => {
    const audio = new FakeAudio();
    const runtime = new StoryRuntime(
      createContext([
        '[playmusic(key="m",intro="s",volume=1.5,delay=0.2,crossfade=0.8,Volume=0.1)]',
        '[playsound(key="s",volume=1.5,delay=0.3,loop=true,Channel="wrong")]',
        '[stopsound(key="s",fadetime=0.4)]',
        '[soundvolume(key="s",volume=0.2)]',
        '[name="A"]ok',
      ]),
      new FakeRenderer(),
      audio,
    );

    await runtime.start();

    expect(audio.playMusicCalls).toEqual([
      {
        crossfadeMs: 800,
        delayMs: 200,
        intro: "s",
        key: "m",
        volume: 1.5,
      },
    ]);
    expect(audio.playSoundCalls).toEqual([
      {
        channel: "s",
        delayMs: 300,
        key: "s",
        loop: true,
        volume: 1.5,
      },
    ]);
    expect(audio.stopSoundCalls).toEqual([{ channel: "s", fadeMs: 400 }]);
    expect(audio.soundVolumeCalls).toEqual([
      { channel: "", fadeMs: 0, volume: 0.2 },
    ]);
    expect(runtime.getState()).toBe("waiting_input");
  });

  it("maps subtitle show and clear commands", async () => {
    const renderer = new FakeRenderer();
    const runtime = new StoryRuntime(
      createContext([
        '[subtitle(text="HELLO",alignment="center",size=24,width=400,x=100,y=200,delay=0.1,fadetime=0.2,multi=true)]',
        "[subtitle(fadetime=0.3)]",
        '[name="A"]ok',
      ]),
      renderer,
      new FakeAudio(),
    );

    await runtime.start();

    expect(renderer.subtitleCalls).toEqual([
      {
        alignment: "center",
        delayMs: 0,
        sizePx: 24,
        text: "HELLO",
        widthPx: 400,
        x: 100,
        y: 200,
      },
    ]);
    expect(renderer.subtitleClearCalls).toEqual([]);
    expect(runtime.getState()).toBe("waiting_input");
    expect(runtime.getDisplayedLineIndex()).toBe(1);

    await runtime.advance();
    expect(renderer.subtitleClearCalls).toEqual([150]);
    expect(runtime.getState()).toBe("waiting_input");
    expect(runtime.getDisplayedLineIndex()).toBe(3);
  });

  it("maps sticker and timer sticker commands", async () => {
    const renderer = new FakeRenderer();
    const sleep = vi.fn(async () => {});
    const runtime = new StoryRuntime(
      createContext([
        '[sticker(id="tip",text="LEFT",alignment="left",size=20,width=200,x=40,y=60,delay=0.05,multi=true,fadetime=0.1)]',
        '[sticker(id="tip",fadetime=0.2)]',
        "[timersticker(x=30,y=90,size=24,time=10)]",
        "[timerclear(afrom=0.8,ato=0.2,duration=0.5)]",
        "[stickerclear]",
        '[name="A"]ok',
      ]),
      renderer,
      new FakeAudio(),
      { sleep },
    );

    await runtime.start();

    expect(renderer.stickerCalls).toEqual([
      {
        alignment: "left",
        append: true,
        // `delay` scales the global typewriter interval (0 here) rather than
        // setting an absolute per-character time.
        delayMs: 0,
        fadeMs: 150,
        id: "tip",
        sizePx: 20,
        text: "LEFT",
        widthPx: 200,
        x: 40,
        y: 60,
      },
    ]);

    // A sticker with a fresh id takes the show branch, whose `block` defaults to
    // true, so it waits for a click before the rest of the script runs.
    expect(runtime.getState()).toBe("waiting_input");
    await runtime.advance();

    expect(renderer.stickerClearCalls).toEqual([{ fadeMs: 150, id: "tip" }]);
    expect(renderer.timerStickerCalls).toEqual([
      {
        durationMs: 1000,
        fromAlpha: 0,
        limitSeconds: 10,
        sizePx: 24,
        toAlpha: 1,
        widthPx: 1280,
        x: 30,
        y: 90,
      },
    ]);
    expect(renderer.timerClearCalls).toEqual([
      {
        durationMs: 500,
      },
      { durationMs: 0 },
    ]);
    expect(renderer.stickersClearCalls).toEqual([150]);
    expect(runtime.getState()).toBe("waiting_input");
  });

  it("click finishes subtitle typing before advancing", async () => {
    const renderer = new FakeRenderer();
    const runtime = new StoryRuntime(
      createContext([
        '[subtitle(text="HELLO",alignment="center")]',
        '[name="A"]ok',
      ]),
      renderer,
      new FakeAudio(),
    );

    await runtime.start();
    expect(runtime.getState()).toBe("waiting_input");

    await runtime.advance();
    expect(runtime.getState()).toBe("waiting_input");
    expect(renderer.lastDialogue).toEqual({ speaker: "A", text: "ok" });
  });

  it("click skips typewriter first, then advances", async () => {
    const sleep = vi.fn(() => new Promise<void>(() => {}));

    const renderer = new FakeRenderer();
    const runtime = new StoryRuntime(
      createContext(['[name="A"]hello']),
      renderer,
      new FakeAudio(),
      {
        sleep,
        typingIntervalMs: 30,
      },
    );

    await runtime.start();

    expect(runtime.getState()).toBe("waiting_input");
    expect(renderer.lastDialogue).toEqual({ speaker: "A", text: "" });
    expect(sleep).toHaveBeenCalled();

    await runtime.advance();
    expect(runtime.getState()).toBe("waiting_input");
    expect(renderer.lastDialogue).toEqual({ speaker: "A", text: "hello" });

    // The auto-appended endtip is a no-op in manual mode (shouldProcessEndtip is
    // false unless button-auto or quick-play is running), so the story ends here.
    await runtime.advance();
    expect(runtime.getState()).toBe("finished");
  });

  it("uses native sticker id state for show, append, and hide", async () => {
    const renderer = new FakeRenderer();
    const runtime = new StoryRuntime(
      createContext([
        '[sticker(id="a",text="one",block=false)]',
        '[sticker(id="a",text="two",multi=true,block=false)]',
        '[sticker(id="a",text="ignored",duration=2,block=false)]',
      ]),
      renderer,
      new FakeAudio(),
    );

    await runtime.start();

    expect(
      renderer.stickerCalls.map((call) => ({
        append: call.append,
        text: call.text,
      })),
    ).toEqual([
      { append: false, text: "one" },
      { append: true, text: "two" },
    ]);
    expect(renderer.stickerClearCalls).toEqual([{ fadeMs: 2000, id: "a" }]);
  });

  it("hides an empty name line without blocking", async () => {
    const renderer = new FakeRenderer();
    const runtime = new StoryRuntime(
      createContext(['[name="A"]', '[name="B"]next']),
      renderer,
      new FakeAudio(),
    );

    await runtime.start();

    expect(renderer.lastDialogue).toEqual({ speaker: "B", text: "next" });
    expect(runtime.getState()).toBe("waiting_input");
  });

  it("appends multiline content until an end line is advanced", async () => {
    const renderer = new FakeRenderer();
    const runtime = new StoryRuntime(
      createContext([
        '[multiline(name="A")]one',
        '[multiline(name="A",end=true)]two',
        '[multiline(name="A")]three',
      ]),
      renderer,
      new FakeAudio(),
    );

    await runtime.start();
    expect(renderer.lastDialogue.text).toBe("one");
    await runtime.advance();
    expect(renderer.lastDialogue.text).toBe("onetwo");
    await runtime.advance();
    expect(renderer.lastDialogue.text).toBe("three");
  });

  it("resumes multiline typing from the characters already on screen", async () => {
    vi.useFakeTimers();
    try {
      const renderer = new FakeRenderer();
      const runtime = new StoryRuntime(
        createContext([
          '[multiline(name="A")]ab',
          '[multiline(name="A",end=true)]cd',
        ]),
        renderer,
        new FakeAudio(),
        { typingIntervalMs: 20 },
      );

      await runtime.start();
      await vi.advanceTimersByTimeAsync(200);
      expect(renderer.lastDialogue.text).toBe("ab");

      renderer.dialogueTexts.length = 0;
      await runtime.advance();
      await vi.advanceTimersByTimeAsync(200);

      // Native AppendText keeps the earlier fragment on screen, so the box is
      // never blanked and "ab" is never retyped character by character.
      expect(renderer.dialogueTexts).toEqual(["ab", "abc", "abcd"]);
      expect(renderer.lastDialogue.text).toBe("abcd");
    } finally {
      vi.useRealTimers();
    }
  });

  it("defaults an omitted multiline delay to the current typewriter delay", async () => {
    vi.useFakeTimers();
    try {
      const renderer = new FakeRenderer();
      const runtime = new StoryRuntime(
        createContext(['[multiline(name="A")]ab']),
        renderer,
        new FakeAudio(),
        { typingIntervalMs: 20 },
      );

      await runtime.start();
      // `GetOrDefault<float>("delay", typeWriterDelay)` makes the ratio
      // 20ms / 40ms = 0.5, so characters land every 10ms rather than every 20.
      await vi.advanceTimersByTimeAsync(9);
      expect(renderer.lastDialogue.text).toBe("");
      await vi.advanceTimersByTimeAsync(1);
      expect(renderer.lastDialogue.text).toBe("a");
      await vi.advanceTimersByTimeAsync(10);
      expect(renderer.lastDialogue.text).toBe("ab");
    } finally {
      vi.useRealTimers();
    }
  });

  it("treats multiline delay as a ratio of the native 40ms origin delay", async () => {
    vi.useFakeTimers();
    try {
      const renderer = new FakeRenderer();
      const runtime = new StoryRuntime(
        createContext(['[multiline(name="A",delay=0.08)]ab']),
        renderer,
        new FakeAudio(),
        { typingIntervalMs: 20 },
      );

      await runtime.start();
      expect(renderer.lastDialogue.text).toBe("");
      await vi.advanceTimersByTimeAsync(39);
      expect(renderer.lastDialogue.text).toBe("");
      await vi.advanceTimersByTimeAsync(1);
      expect(renderer.lastDialogue.text).toBe("a");
      await vi.advanceTimersByTimeAsync(40);
      expect(renderer.lastDialogue.text).toBe("ab");
    } finally {
      vi.useRealTimers();
    }
  });

  it("ignores subtitle ghost parameters and falls back invalid alignment to left", async () => {
    const renderer = new FakeRenderer();
    const runtime = new StoryRuntime(
      createContext([
        '[subtitle(text="x",alignment="middle",delay=9,fadetime=9,multi=true)]',
      ]),
      renderer,
      new FakeAudio(),
      { typingIntervalMs: 25 },
    );

    await runtime.start();

    expect(renderer.subtitleCalls[0]).toMatchObject({
      alignment: "left",
      delayMs: 25,
      widthPx: 1280,
    });
  });

  it("maps cgitem tween parameters and hidecgitem keys with native defaults", async () => {
    const renderer = new FakeRenderer();
    const runtime = new StoryRuntime(
      createContext([
        '[cgitem(image="cgitem_test",id="left",style="cg",pfrom="1,2",pto="3,4",pduration=2,pdelay=0.5,sfrom=0.8,sto=1.2,sduration=3,sdelay=0.25,afrom=0,ato=1,aduration=1,adelay=0.1,rfrom=-10,rto=20,rduration=4,width=640,height=360,ease="Linear",block=true,layer=9,fadetime=8)]',
        '[hidecgitem(image="cgitem_test",id="left",block=true)]',
      ]),
      renderer,
      new FakeAudio(),
    );

    await runtime.start();

    expect(renderer.cgItemCalls).toEqual([
      expect.objectContaining({
        alphaDelayMs: 100,
        alphaDurationMs: 1000,
        assetKey: "cgitem_test",
        block: true,
        ease: "Linear",
        height: 360,
        key: "cgitem_test_left",
        positionDelayMs: 500,
        positionDurationMs: 2000,
        positionFrom: { x: 1, y: 2 },
        positionTo: { x: 3, y: 4 },
        rotationDurationMs: 4000,
        scaleDelayMs: 250,
        scaleDurationMs: 3000,
        width: 640,
      }),
    ]);
    expect(renderer.clearCgItemCalls).toEqual([
      {
        block: true,
        ease: "Linear",
        fadeMs: 130,
        key: "cgitem_test_left",
      },
    ]);
  });

  it("maps parameterless hidecgitem to clear-all", async () => {
    const renderer = new FakeRenderer();
    const runtime = new StoryRuntime(
      createContext(['[hidecgitem(fadetime=1,ease="Linear")]']),
      renderer,
      new FakeAudio(),
    );
    await runtime.start();
    expect(renderer.clearCgItemCalls).toEqual([
      { block: false, ease: "Linear", fadeMs: 1000, key: undefined },
    ]);
  });

  it("skipnode can finish the story from a dialogue input wait", async () => {
    const sleep = vi.fn(() => new Promise<void>(() => {}));
    const renderer = new FakeRenderer();
    const runtime = new StoryRuntime(
      createContext([
        '[skipnode(mode="nofirstskip")]',
        '[name="A"]hello',
        '[skipnode(mode="skip")]',
        '[name="B"]next',
      ]),
      renderer,
      new FakeAudio(),
      {
        sleep,
        typingIntervalMs: 30,
      },
    );

    await runtime.start();

    expect(runtime.getState()).toBe("waiting_input");
    expect(runtime.canSkipNode()).toBe(true);
    expect(renderer.lastDialogue).toEqual({ speaker: "A", text: "" });

    await runtime.skipNode();

    expect(runtime.getState()).toBe("finished");
    expect(runtime.canSkipNode()).toBe(false);
  });

  it("prioritizes SkipToThis and resumes from the command after its anchor", async () => {
    const renderer = new FakeRenderer();
    const runtime = new StoryRuntime(
      createContext(['[name="A"]before', "[SkipToThis]", '[name="B"]after']),
      renderer,
      new FakeAudio(),
    );

    await runtime.start();
    await runtime.skipNode();

    expect(runtime.getState()).toBe("waiting_input");
    expect(renderer.lastDialogue).toEqual({ speaker: "B", text: "after" });
  });

  it("disables segment skip when the story has no skip anchors", async () => {
    const runtime = new StoryRuntime(
      createContext(['[name="A"]before', '[name="B"]after']),
      new FakeRenderer(),
      new FakeAudio(),
    );

    await runtime.start();
    expect(runtime.canSkipNode()).toBe(false);
    await runtime.skipNode();
    expect(runtime.getState()).toBe("waiting_input");
  });

  it("does not expose segment skip during an active command without anchors", async () => {
    const sleep = vi.fn(() => new Promise<void>(() => {}));
    const runtime = new StoryRuntime(
      createContext(["[delay(time=30)]", '[name="A"]unreachable']),
      new FakeRenderer(),
      new FakeAudio(),
      { sleep },
    );

    const startPromise = runtime.start();
    await Promise.resolve();
    expect(runtime.canSkipNode()).toBe(false);
    await runtime.skipNode();
    expect(runtime.getState()).toBe("waiting_timer");
    void startPromise;
  });

  it("does not jump backward after passing SkipToThis", async () => {
    const renderer = new FakeRenderer();
    const runtime = new StoryRuntime(
      createContext(["[SkipToThis]", '[name="A"]after', '[name="B"]later']),
      renderer,
      new FakeAudio(),
    );

    await runtime.start();
    await runtime.skipNode();

    expect(runtime.getState()).toBe("waiting_input");
    expect(renderer.lastDialogue).toEqual({ speaker: "A", text: "after" });
  });
});
