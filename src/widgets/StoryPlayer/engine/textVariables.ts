const TEXT_VARIABLE_RE = /\{@([a-zA-Z0-9_.]+)\}/g;
const BUILTIN_TEXT_VARIABLES: Record<string, unknown> = {
  nbs: "\u00A0",
};

export function getStoryNickname(): string {
  const mediaWiki = (
    globalThis as {
      mw?: { config?: { get?: (key: string) => unknown } };
    }
  ).mw;
  const name = mediaWiki?.config?.get?.("wgUserName");
  return typeof name === "string" && name
    ? name.replace(/[Dd][Rr]\./, "")
    : "博士";
}

export function expandStoryText(
  text: string,
  variables: Record<string, unknown> = {},
): string {
  return text.replace(TEXT_VARIABLE_RE, (_match, rawName: string) => {
    const name = rawName.toLowerCase();
    if (name === "nickname") return getStoryNickname();

    const value = variables[name] ?? BUILTIN_TEXT_VARIABLES[name];
    return value == null ? "" : String(value);
  });
}
