import { describe, expect, it, vi } from "vitest";

import { CommandRegistry } from "../src/widgets/StoryPlayer/engine/commandRegistry";
import { createExecutionHandle } from "../src/widgets/StoryPlayer/engine/execution";

import type { ParsedCommandLine } from "../src/widgets/StoryPlayer/engine/types";

function command(name: string): ParsedCommandLine {
  return {
    args: {},
    command: name,
    content: "",
    kind: "command",
    lineNumber: 1,
    paramPresent: false,
    raw: `[${name}]`,
    trailingText: "",
  };
}

describe("command execution primitives", () => {
  it("returns multiple subscribers in registration order under a folded key", async () => {
    const registry = new CommandRegistry<number>();
    registry.register("Dialog", () => 1);
    registry.register("dialog", async () => 2);

    const executors = registry.get("DIALOG") ?? [];
    expect(executors).toHaveLength(2);
    await expect(
      Promise.all(executors.map((executor) => executor(command("dialog")))),
    ).resolves.toEqual([1, 2]);
  });

  it("drops a command key once its last subscriber unregisters", () => {
    const registry = new CommandRegistry<number>();
    const unregister = registry.register("Dialog", () => 1);

    expect(registry.has("dialog")).toBe(true);
    unregister();
    expect(registry.has("dialog")).toBe(false);
    expect(registry.get("dialog")).toBeNull();
  });

  it("settles an execution handle once with its end reason", async () => {
    const onEnd = vi.fn();
    const handle = createExecutionHandle(true, onEnd);
    handle.end("force_end");
    handle.end("reset");
    await expect(handle.completion).resolves.toBe("force_end");
    expect(onEnd).toHaveBeenCalledOnce();
  });
});
