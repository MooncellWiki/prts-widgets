import { ExecutorComponent, type PanelExecutors } from "../ExecutorComponent";
import {
  boxedParamBool,
  convertStoryParameter,
  exactArg,
} from "../commandParams";

import type { AutoPlayState } from "../types";

interface TheaterPlayback {
  readAutoPlay: () => AutoPlayState;
  applyAutoPlay: (state: AutoPlayState) => void;
  cancelAutoClick: () => void;
}

/**
 * Torappu.AVG.AVGTheaterLabel._ExecuteTheaterNode (2791 @ 0x1841B96C0)
 * forwards mode to AVGController._SetTheaterModeStatus (0x184171D80).
 * The Web label owns theater state and delegates playback changes to runtime.
 */
export class TheaterLabel extends ExecutorComponent {
  private active = false;
  private savedAutoPlay: AutoPlayState | null = null;

  constructor(
    private readonly playback: TheaterPlayback,
    private readonly variables?: Readonly<Record<string, unknown>>,
  ) {
    super();
  }

  get isActive(): boolean {
    return this.active;
  }

  protected getExecutors(): PanelExecutors {
    return {
      theater: ({ args }) => {
        const mode = convertStoryParameter(
          exactArg(args, "mode"),
          this.variables,
          "exact",
        );
        this.setTheaterMode(boxedParamBool(mode, true));
        return "continue";
      },
    };
  }

  clearOnSkipToThis(): void {
    // SkipStory (2791 @ 0x18416E560) clears the active story flag. The auto
    // status saved by _SaveAutoStatus (0x184171C00) lives on AVGController.
    this.active = false;
  }

  private setTheaterMode(active: boolean): void {
    this.active = active;
    if (active) {
      // _SaveAutoStatus runs on every enter, including a repeated enter.
      const current = this.playback.readAutoPlay();
      this.savedAutoPlay = current;
      this.playback.applyAutoPlay({
        ...current,
        buttonSpeedLevel: 0,
        mode: "button_auto",
      });
      return;
    }

    this.playback.cancelAutoClick();
    const saved = this.savedAutoPlay;
    this.savedAutoPlay = null;
    // _LoadAutoStatus (2791 @ 0x1841711C0) restores button auto or falls
    // back to manual. Web snapshots both gears to support debug seeking.
    this.playback.applyAutoPlay({
      ...(saved ?? this.playback.readAutoPlay()),
      mode: saved?.mode === "button_auto" ? "button_auto" : "default",
    });
  }
}
