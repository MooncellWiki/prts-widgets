import { effectScope, type EffectScope } from "vue";

import { afterEach, describe, expect, it, vi } from "vitest";

import { usePageTheme } from "../src/pages/usePageTheme";
import { useHostTheme } from "../src/utils/useHostTheme";

let scope: EffectScope | undefined;
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function mockSystemTheme(dark: boolean) {
  const media = new EventTarget() as MediaQueryList;
  Object.defineProperty(media, "matches", { value: dark, writable: true });
  vi.spyOn(window, "matchMedia").mockReturnValue(media);
  return (matches: boolean) => {
    Object.defineProperty(media, "matches", { value: matches });
    media.dispatchEvent(Object.assign(new Event("change"), { matches }));
  };
}

afterEach(() => {
  scope?.stop();
  vi.restoreAllMocks();
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.className = "";
  localStorage.clear();
});

describe("page theme via VueUse", () => {
  it("follows system changes and lets explicit data-theme win", async () => {
    const setSystemDark = mockSystemTheme(true);
    scope = effectScope();
    scope.run(usePageTheme);
    const root = document.documentElement;
    await flush();
    expect(root.className).toBe("skin-theme-clientpref-night");
    setSystemDark(false);
    await flush();
    expect(root.className).toBe("skin-theme-clientpref-day");
    root.dataset.theme = "dark";
    await flush();
    expect(root.className).toBe("skin-theme-clientpref-night");
    root.dataset.theme = "light";
    await flush();
    setSystemDark(true);
    await flush();
    expect(root.className).toBe("skin-theme-clientpref-day");
    delete root.dataset.theme;
    await flush();
    expect(root.className).toBe("skin-theme-clientpref-night");
  });

  it("honors the initial explicit theme without using unrelated stored preferences", async () => {
    mockSystemTheme(true);
    localStorage.setItem("vueuse-color-scheme", "dark");
    document.documentElement.dataset.theme = "light";
    scope = effectScope();
    scope.run(usePageTheme);
    await flush();
    expect(document.documentElement.className).toBe(
      "skin-theme-clientpref-day",
    );
    expect(localStorage.getItem("vueuse-color-scheme")).toBe("dark");
  });

  it("stops reacting to DOM and media changes when its Vue scope is disposed", async () => {
    const setSystemDark = mockSystemTheme(false);
    scope = effectScope();
    scope.run(usePageTheme);
    await flush();
    scope.stop();
    setSystemDark(true);
    document.documentElement.dataset.theme = "dark";
    await flush();
    expect(document.documentElement.className).toBe(
      "skin-theme-clientpref-day",
    );
  });
});

it("uses Vector's light default and tracks system changes when the wiki requests them", async () => {
  const setSystemDark = mockSystemTheme(true);
  scope = effectScope();
  const theme = scope.run(useHostTheme)!;
  const root = document.documentElement;
  await flush();
  expect(theme.value).toBe("light");
  root.className = "skin-theme-clientpref-os";
  await flush();
  expect(theme.value).toBe("dark");
  setSystemDark(false);
  await flush();
  expect(theme.value).toBe("light");
  root.className = "skin-theme-clientpref-night";
  await flush();
  expect(theme.value).toBe("dark");
});

it("tracks and releases the wiki theme listener on legacy MediaQueryList", () => {
  const system = {
    matches: false,
    addListener: vi.fn<(sync: () => void) => void>(),
    removeListener: vi.fn(),
  };
  vi.spyOn(window, "matchMedia").mockReturnValue(
    system as unknown as MediaQueryList,
  );
  document.documentElement.className = "skin-theme-clientpref-os";
  scope = effectScope();
  const theme = scope.run(useHostTheme)!;
  const [sync] = system.addListener.mock.calls[0]!;
  expect(theme.value).toBe("light");
  system.matches = true;
  sync();
  expect(theme.value).toBe("dark");
  scope.stop();
  expect(system.removeListener).toHaveBeenCalledWith(sync);
});
