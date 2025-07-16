import { ref, watch, computed, onUnmounted, type Ref } from "vue";

import { useIntervalFn } from "@vueuse/core";
import { Howl } from "howler";

import { downloadFile } from "../utils/dl";

export enum PlayState {
  Idle = "idle",
  Loading = "loading",
  Loaded = "loaded",
  Playing = "playing",
  Paused = "paused",
  Stopped = "stopped",
}

export enum PlayerAction {
  Load = "load",
  Play = "play",
  Pause = "pause",
  Stop = "stop",
  ChangeVol = "changeVol",
  ChangeMute = "changeMute",
  ChangeLoop = "changeLoop",
  Process = "process",
  Download = "download",
}

export interface Audio {
  control: (action: PlayerAction, value?: number) => void;
  state: Ref<PlayState>;
  vol: Ref<number>;
  mute: Ref<boolean>;
  loop: Ref<boolean>;
  process: Ref<number>;
  len: Ref<number>;
}

export function useAudio(src: string, p?: number): Audio {
  const state = ref<PlayState>(PlayState.Idle);
  const vol = ref(100);
  const mute = ref(false);
  const loop = ref(false);
  const process = ref(0);
  const len = ref(0);

  const introSound = ref<Howl | null>(null);
  const loopSound = ref<Howl | null>(null);

  const isCombined = computed(
    () => src.includes("_combine") && p !== undefined && p !== 0,
  );

  const createSounds = () => {
    if (isCombined.value) {
      const introSrc = src.replace("_combine", "_intro");
      const loopSrc = src.replace("_combine", "_loop");

      introSound.value = new Howl({ src: [introSrc], preload: false });
      loopSound.value = new Howl({ src: [loopSrc], preload: false });
    } else {
      introSound.value = new Howl({ src: [src], preload: false });
    }
  };

  useIntervalFn(() => {
    if (state.value !== PlayState.Playing) return;

    if (isCombined.value) {
      if (introSound.value?.playing()) {
        process.value = Math.floor(introSound.value.seek() as number);
      } else if (loopSound.value?.playing()) {
        process.value =
          Math.floor(loopSound.value.seek() as number) +
          (introSound.value?.duration() || 0);
      }
    } else if (introSound.value?.playing()) {
      process.value = Math.floor(introSound.value.seek() as number);
    }
  }, 50);

  const control = (action: PlayerAction, value?: number) => {
    switch (action) {
      case PlayerAction.Load: {
        if (state.value !== PlayState.Idle) return;

        state.value = PlayState.Loading;
        createSounds();

        if (isCombined.value) {
          introSound.value?.once("load", () => {
            loopSound.value?.once("load", () => {
              if (state.value !== PlayState.Stopped) return;
              state.value = PlayState.Playing;
              len.value =
                (introSound.value?.duration() || 0) +
                (loopSound.value?.duration() || 0);
              introSound.value?.play();
            });
            loopSound.value?.load();
          });

          introSound.value?.on("end", () => {
            if (loopSound.value) {
              if (state.value !== PlayState.Stopped) loopSound.value.play();
            } else {
              state.value = PlayState.Loaded;
            }
          });

          loopSound.value?.on("load", () => {
            loopSound.value?.loop(loop.value);
          });

          introSound.value?.load();
          loopSound.value?.load();
        } else {
          introSound.value?.once("load", () => {
            if (state.value !== PlayState.Stopped) return;
            introSound.value?.loop(loop.value);
            introSound.value?.play();
            state.value = PlayState.Playing;
            len.value = introSound.value?.duration() || 0;
          });

          introSound.value?.load();
        }
        break;
      }
      case PlayerAction.Play: {
        if (state.value === PlayState.Playing) return;
        if (state.value === PlayState.Idle) {
          control(PlayerAction.Load);
          return;
        }

        if (isCombined.value) {
          if (process.value < (introSound.value?.duration() || 0)) {
            introSound.value?.play();
          } else loopSound.value?.play();
        } else {
          introSound.value?.play();
        }

        state.value = PlayState.Playing;
        break;
      }

      case PlayerAction.Pause: {
        introSound.value?.pause();
        loopSound.value?.pause();
        state.value = PlayState.Paused;
        break;
      }

      case PlayerAction.Stop: {
        introSound.value?.stop();
        loopSound.value?.stop();
        process.value = 0;
        state.value = PlayState.Stopped;
        break;
      }

      case PlayerAction.ChangeVol: {
        if (value === undefined) return;
        vol.value = value;
        introSound.value?.volume(value / 100);
        loopSound.value?.volume(value / 100);
        break;
      }

      case PlayerAction.ChangeMute: {
        mute.value = !mute.value;
        introSound.value?.mute(mute.value);
        loopSound.value?.mute(mute.value);
        break;
      }

      case PlayerAction.ChangeLoop: {
        loop.value = !loop.value;
        if (isCombined.value) {
          loopSound.value?.loop(loop.value);
        } else {
          introSound.value?.loop(loop.value);
        }
        break;
      }

      case PlayerAction.Process: {
        if (value === undefined) return;

        if (isCombined.value) {
          const currentProcess = process.value;
          const introDuration = introSound.value?.duration() || 0;
          if (currentProcess < introDuration) {
            if (value < introDuration) {
              introSound.value?.seek(value);
            } else {
              introSound.value?.stop();
              loopSound.value?.seek(value - introDuration);
              loopSound.value?.play();
            }
          } else if (value > introDuration) {
            loopSound.value?.seek(value - introDuration);
          } else {
            loopSound.value?.stop();
            introSound.value?.seek(value);
            introSound.value?.play();
          }
        } else {
          introSound.value?.seek(value);
        }

        process.value = value;
        break;
      }

      case PlayerAction.Download: {
        if (isCombined.value) {
          const introSrc = src.replace("_combine", "_intro");
          const loopSrc = src.replace("_combine", "_loop");
          downloadFile(introSrc.split("/").pop() || "audio.mp3", introSrc);
          downloadFile(loopSrc.split("/").pop() || "audio.mp3", loopSrc);
        } else {
          downloadFile(src.split("/").pop() || "audio.mp3", src);
        }
        break;
      }
    }
  };

  onUnmounted(() => {
    introSound.value?.unload();
    loopSound.value?.unload();
  });

  watch(vol, (newVol) => {
    introSound.value?.volume(newVol / 100);
    loopSound.value?.volume(newVol / 100);
  });

  watch(mute, (newMute) => {
    introSound.value?.mute(newMute);
    loopSound.value?.mute(newMute);
  });

  return {
    control,
    state,
    vol,
    mute,
    loop,
    process,
    len,
  };
}
