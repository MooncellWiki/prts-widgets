/** 线上检查使用 parse 结果，排除 display:none 空槽；总 DOM 槽数始终是 21。 */
import assert from "node:assert/strict";

for (const [series, expected, latest] of [
  ["珊瑚海岸", 12, "珊瑚海岸11"],
  ["时代", 15, "时代15"],
  ["斗争血脉", 9, "斗争血脉8"],
] as const) {
  const response = await fetch(
    `https://prts.wiki/api.php?${new URLSearchParams({ action: "parse", page: `时装回廊/${series}`, prop: "text", format: "json", formatversion: "2", maxage: "0" })}`,
  );
  assert(response.ok, `${series}: HTTP ${response.status}`);
  const json = (await response.json()) as {
    parse?: { text: string };
    error?: { info: string };
  };
  assert(json.parse, json.error?.info || "缺少 parse 结果");
  const slides = [
    ...json.parse.text.matchAll(
      /<div class="swiper-slide" style="([^"]*)"><img src="([^"]*)"/g,
    ),
  ];
  const visible = slides.filter(
    (m) => !m[1].replaceAll(/\s/g, "").includes("display:none"),
  );
  assert.equal(slides.length, 21, `${series}: 槽位数`);
  assert.equal(visible.length, expected, `${series}: 可见图数量`);
  assert(
    decodeURIComponent(visible[0][2]).includes(latest),
    `${series}: 最新图位于首位`,
  );
  console.log(
    `${series}: ${visible.length} 张可见图 / ${slides.length} 槽位，最新图与倒序正常`,
  );
}
