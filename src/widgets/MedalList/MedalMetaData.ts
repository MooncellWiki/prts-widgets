export async function getMedalMetaData(): Promise<Record<string, any>> {
  const resp = await fetch(
    `/api.php?${new URLSearchParams({
      action: "parse",
      format: "json",
      page: "光荣之路/data",
      prop: "wikitext",
      utf8: "1",
      disablelimitreport: "1",
      disableeditsection: "1",
      disabletoc: "1",
    })}`,
  );
  const json = await resp.json();
  const content = JSON.parse(json.parse.wikitext["*"]);
  return content;
}
