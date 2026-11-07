import { describe, expect, it, vi } from "vitest";

import { StoryRuntime } from "../../src/widgets/StoryPlayer/engine/runtime";
import {
  createContext,
  FakeAudio,
  FakeRenderer,
} from "../helpers/runtimeFakes";

describe("StoryRuntime", () => {
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

  it("dispatches an empty music key so audio can retire the old channel", async () => {
    const audio = new FakeAudio();
    const onWarning = vi.fn();
    const runtime = new StoryRuntime(
      createContext(["[playmusic(crossfade=0.32)]", '[name="A"]ok']),
      new FakeRenderer(),
      audio,
      { onWarning },
    );

    await runtime.start();

    expect(audio.playMusicCalls).toEqual([
      { crossfadeMs: 320, delayMs: 0, intro: undefined, key: "", volume: 1 },
    ]);
    expect(onWarning).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "parse",
        detail: "playmusic key is empty",
      }),
    );
  });

  it("runs the end-of-story audio reset when playback finishes", async () => {
    const audio = new FakeAudio();
    const runtime = new StoryRuntime(
      createContext([
        // A loop ambience with no matching stopsound: only the story-end
        // OnReset -> _ResetAudio sweep (2791 VA 0x1841C6200) may stop it.
        '[playsound(key="$burningloop1", loop=true, channel="bgs")]',
        "[name=A]done",
      ]),
      new FakeRenderer(),
      audio,
    );

    await runtime.start();
    // The reset must not fire while the story is merely waiting.
    expect(audio.resetAudioCalls).toBe(0);
    await runtime.advance();

    expect(runtime.getState()).toBe("finished");
    // Exactly once: finishPlayback is the single natural-end entry point.
    expect(audio.resetAudioCalls).toBe(1);
  });

  it("runs the end-of-story audio reset once when a skip ends the story", async () => {
    const audio = new FakeAudio();
    const runtime = new StoryRuntime(
      createContext([
        '[playsound(key="$burningloop1", loop=true, channel="bgs")]',
        '[skipnode(mode="nofirstskip")]',
        '[name="A"]hello',
        '[skipnode(mode="skip")]',
        '[name="B"]next',
      ]),
      new FakeRenderer(),
      audio,
      {
        firstRead: false,
        sleep: vi.fn(() => new Promise<void>(() => {})),
        typingIntervalMs: 30,
      },
    );

    await runtime.start();
    expect(audio.resetAudioCalls).toBe(0);
    // Native SkipStory -> StopStory("Skipped") -> EndStory still reaches
    // AVGController.OnStoryEnd, whose component OnReset sweep runs _ResetAudio.
    await runtime.skipNode();

    expect(runtime.getState()).toBe("finished");
    expect(audio.resetAudioCalls).toBe(1);
  });
});
