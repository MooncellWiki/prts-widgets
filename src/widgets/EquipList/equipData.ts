const cache: Record<string, string> = {};
export async function getEquipData(name: string): Promise<string> {
  if (cache[name]) return cache[name];
  const resp = await fetch(
    `/api.php?${new URLSearchParams({
      action: "parse",
      format: "json",
      title: "干员模组一览",
      text: `{{#lst:${name}|专属模组}}`,
      prop: "text",
      utf8: "1",
      disablelimitreport: "1",
      disableeditsection: "1",
      disabletoc: "1",
    })}`,
  );
  const json = await resp.json();
  const content = json.parse.text["*"];
  cache[name] = content;
  return content;
}
