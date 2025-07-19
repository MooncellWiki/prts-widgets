import { onUnmounted, ref, watch, type Ref } from "vue";

import { useIntervalFn } from "@vueuse/core";
import { Howl } from "howler";

import { downloadFile } from "../utils/dl";

export type PlayState = "idle" | "loading" | "loaded" | "playing" | "paused";

export interface Audio {
  load: () => void;
  play: () => void;
  pause: () => void;
  changeVol: (value: number) => void;
  changeMute: () => void;
  changeLoop: () => void;
  seek: (value: number) => void;
  download: () => void;
  state: Ref<PlayState>;
  vol: Ref<number>;
  mute: Ref<boolean>;
  loop: Ref<boolean>;
  process: Ref<number>;
  len: Ref<number>;
  stopped: Ref<boolean>;
}
function loadPromise(how: Howl): Promise<void> {
  return new Promise((res) => {
    how.once("load", () => {
      res();
    });
  });
}
export function useAudio(src: string, p?: number): Audio {
  const state = ref<PlayState>("idle");
  const vol = ref(100);
  const mute = ref(false);
  const loop = ref(false);
  const process = ref(0);
  const len = ref(0);

  const stopped = ref(false);

  let introSound: Howl | undefined;
  let loopSound: Howl | undefined;

  const isCombined = src.includes("_combine") && p !== undefined && p !== 0;
  if (isCombined) {
    const introSrc = src.replace("_combine", "_intro");
    const loopSrc = src.replace("_combine", "_loop");

    introSound = new Howl({ src: [introSrc], preload: false });
    loopSound = new Howl({ src: [loopSrc], preload: false });
    Promise.all([loadPromise(introSound!), loadPromise(loopSound!)]).then(
      () => {
        console.log("loaded");
        len.value =
          (introSound?.duration() || 0) + (loopSound?.duration() || 0);
        if (stopped.value) {
          state.value = "loaded";
          return;
        }
        state.value = "playing";

        introSound?.play();
      },
    );
    introSound.on("end", () => {
      if (loopSound) {
        if (stopped.value) {
          state.value = "loaded";
          return;
        }
        loopSound.play();
      } else {
        state.value = "loaded";
      }
    });

    loopSound?.on("load", () => {
      loopSound?.loop(loop.value);
    });
    loopSound.on("end", () => {
      if (!loop.value) {
        state.value = "paused";
      }
    });
  } else {
    introSound = new Howl({ src: [src], preload: false });
    introSound?.once("load", () => {
      len.value = introSound?.duration() || 0;
      if (stopped.value) {
        state.value = "loaded";
        return;
      }
      introSound?.loop(loop.value);
      introSound?.play();
      state.value = "playing";
    });
    introSound.on("end", () => {
      state.value = "paused";
    });
  }

  useIntervalFn(() => {
    if (state.value !== "playing") return;

    if (isCombined) {
      if (introSound?.playing()) {
        process.value = Math.floor(introSound.seek() as number);
      } else if (loopSound?.playing()) {
        process.value =
          Math.floor(loopSound.seek() as number) +
          (introSound?.duration() || 0);
      }
    } else if (introSound?.playing()) {
      process.value = Math.floor(introSound.seek() as number);
    }
  }, 50);

  const load = () => {
    if (state.value !== "idle") return;

    state.value = "loading";

    if (isCombined) {
      introSound?.load();
      loopSound?.load();
    } else {
      introSound?.load();
    }
  };

  const play = () => {
    if (state.value === "playing") return;
    if (state.value === "idle") {
      load();
      return;
    }

    if (isCombined) {
      if (process.value < (introSound?.duration() || 0)) {
        introSound?.play();
      } else loopSound?.play();
    } else {
      introSound?.play();
    }

    state.value = "playing";
  };

  const pause = () => {
    introSound?.pause();
    loopSound?.pause();
    state.value = "paused";
  };

  const changeVol = (value: number) => {
    vol.value = value;
    introSound?.volume(value / 100);
    loopSound?.volume(value / 100);
  };

  const changeMute = () => {
    mute.value = !mute.value;
    introSound?.mute(mute.value);
    loopSound?.mute(mute.value);
  };

  const changeLoop = () => {
    loop.value = !loop.value;
    if (isCombined) {
      loopSound?.loop(loop.value);
    } else {
      introSound?.loop(loop.value);
    }
  };

  const seek = (value: number) => {
    if (isCombined) {
      const currentProcess = process.value;
      const introDuration = introSound?.duration() || 0;
      if (currentProcess < introDuration) {
        if (value < introDuration) {
          introSound?.seek(value);
        } else {
          introSound?.stop();
          loopSound?.seek(value - introDuration);
          loopSound?.play();
        }
      } else if (value > introDuration) {
        loopSound?.seek(value - introDuration);
      } else {
        loopSound?.stop();
        introSound?.seek(value);
        introSound?.play();
      }
    } else {
      introSound?.seek(value);
    }

    process.value = value;
  };

  const download = () => {
    if (isCombined) {
      const introSrc = src.replace("_combine", "_intro");
      const loopSrc = src.replace("_combine", "_loop");
      downloadFile(introSrc.split("/").pop() || "audio.mp3", introSrc);
      downloadFile(loopSrc.split("/").pop() || "audio.mp3", loopSrc);
    } else {
      downloadFile(src.split("/").pop() || "audio.mp3", src);
    }
  };

  onUnmounted(() => {
    introSound?.unload();
    loopSound?.unload();
  });

  watch(vol, (newVol) => {
    introSound?.volume(newVol / 100);
    loopSound?.volume(newVol / 100);
  });

  watch(mute, (newMute) => {
    introSound?.mute(newMute);
    loopSound?.mute(newMute);
  });
  watch(stopped, () => {
    if (!stopped.value) {
      return;
    }
    introSound?.stop();
    loopSound?.stop();
    process.value = 0;
    stopped.value = true;
    if (state.value === "playing") {
      state.value = "paused";
    }
  });

  return {
    load,
    play,
    pause,
    changeVol,
    changeMute,
    changeLoop,
    seek,
    download,
    state,
    vol,
    mute,
    loop,
    process,
    len,
    stopped,
  };
}
