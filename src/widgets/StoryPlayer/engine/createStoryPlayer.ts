import { sound } from "@pixi/sound";

import { HtmlStoryAudio } from "./audio";
import { PixiStoryRenderer } from "./renderer";
import { StoryRuntime } from "./runtime";

import type { Context } from "../context";
import type {
  AutoPlayMode,
  PlayerState,
  RuntimeLogPosition,
  StoryPlayer,
} from "./types";

// Register the @pixi/sound loader with PIXI's Assets system. This is a
// side-effecting import: merely `import type` (as audio.ts does) is erased and
// leaves Assets unable to resolve audio URLs, so playMusic/playSound would
// silently no-op. The source repo did this in its main.ts entry; here the
// engine owns its own bootstrap.
sound.disableAutoPause = true;

export function createStoryPlayer(context: Context): StoryPlayer {
  let runtime: StoryRuntime | null = null;
  let renderer: PixiStoryRenderer | null = null;
  let audio: HtmlStoryAudio | null = null;
  let mounted = false;

  const ensureRuntime = () => {
    if (runtime) return runtime;

    renderer = new PixiStoryRenderer(context, (detail) =>
      console.warn(`[renderer] ${detail}`),
    );
    audio = new HtmlStoryAudio(context);
    runtime = new StoryRuntime(context, renderer, audio, {
      onWarning: (warning) =>
        console.warn(
          "[runtime]",
          warning.type,
          warning.detail ?? "",
          `@${warning.cursor}`,
        ),
      typingIntervalMs: 40,
    });

    return runtime;
  };

  return {
    async mount(host: HTMLElement): Promise<void> {
      ensureRuntime();
      if (mounted) return;

      await renderer!.mount(host);
      mounted = true;
    },

    async start(): Promise<void> {
      if (!mounted) throw new Error("StoryPlayer is not mounted yet");
      await ensureRuntime().start();
    },

    async advance(): Promise<void> {
      if (!mounted) throw new Error("StoryPlayer is not mounted yet");
      await ensureRuntime().advance();
    },

    canSkipNode(): boolean {
      return ensureRuntime().canSkipNode();
    },

    destroy(): void {
      runtime?.destroy();
      audio?.destroy();
      renderer?.destroy();

      runtime = null;
      audio = null;
      renderer = null;
      mounted = false;
    },

    getAutoPlayState() {
      return ensureRuntime().getAutoPlayState();
    },

    getDecisionSelectValue(): number {
      return runtime?.getDecisionSelectValue() ?? 0;
    },

    getDisplayedLineIndex(): number | null {
      return runtime?.getDisplayedLineIndex() ?? null;
    },

    getLogPosition(): RuntimeLogPosition {
      return runtime?.getLogPosition() ?? { lineIndex: null, selections: [] };
    },

    getState(): PlayerState {
      return runtime?.getState() ?? "idle";
    },

    setAutoPlayMode(mode: AutoPlayMode): void {
      ensureRuntime().setAutoPlayMode(mode);
    },

    setAutoPlaySpeedLevel(level: number): void {
      ensureRuntime().setAutoPlaySpeedLevel(level);
    },

    async skipNode(): Promise<void> {
      if (!mounted) throw new Error("StoryPlayer is not mounted yet");
      await ensureRuntime().skipNode();
    },
  };
}
