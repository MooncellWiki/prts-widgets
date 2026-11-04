import { describe, expect, it } from "vitest";

import { StoryRuntime } from "../../src/widgets/StoryPlayer/engine/runtime";
import {
  createContext,
  FakeAudio,
  FakeRenderer,
} from "../helpers/runtimeFakes";

describe("StoryRuntime", () => {
  it.each(["advance", "skipNode"] as const)(
    "fades residual loop sounds once on story end via %s",
    async (finish) => {
      const audio = new FakeAudio();
      const runtime = new StoryRuntime(
        createContext([
          '[playsound(key="s",loop=true)]',
          '[name="A"]ok',
          '[skipnode(mode="skip")]',
        ]),
        new FakeRenderer(),
        audio,
      );
      await runtime.start();
      expect(runtime.getState()).toBe("waiting_input");
      expect(audio.playSoundCalls).toHaveLength(1);
      expect(runtime.canSkipNode()).toBe(true);
      expect(audio.stopAllSoundsCalls).toEqual([]);
      await runtime[finish]();
      expect(runtime.getState()).toBe("finished");
      expect(audio.stopAllSoundsCalls).toEqual([400]);
    },
  );

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
});
