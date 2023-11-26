export async function getOnlineDate() {
  const resp = await fetch("/rest.php/v1/page/干员密录一览%2F密录上线时间");
  const content = (await resp.json()).source as string;
  let lines = content.split("\n");
  lines = lines.map((line) => {
    return line.replaceAll(/\s/g, "");
  });
  const temp = lines
    .filter((line) => {
      return line.match(/\|(.*?)\|\|(.*?)\|\|(.*?)\|\|(.*?)\|\|(.*?)/);
    })
    .map((line) => {
      const extract = line.match(
        /\|(.*?)\|\|(.*?)\|\|(.*?)\|\|(.*?)\|\|(.*?)/,
      ) as string[];
      return [
        (extract[1].match(/\[\[(.*?)\|(.*?)\]\]/) as string[])[2] as string,
        // 第一密录下标：3
        extract.slice(3, -1).map((str) => {
          return new Date(str);
        }),
      ];
    });

  const result = Object.fromEntries(temp);
  return result;
}

export function getTargetDate(dates: Date[], isLatest: boolean) {
  let latest = dates[0];
  for (const date of dates) {
    if (
      date.toString() !== "Invalid Date" && isLatest
        ? date > latest
        : date < latest
    )
      latest = date;
  }
  return latest;
}
