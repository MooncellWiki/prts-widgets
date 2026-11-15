import { effectScope, type EffectScope } from "vue";

import { afterEach, describe, expect, it, vi } from "vitest";

import { usePageTheme } from "../src/pages/usePageTheme";

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
