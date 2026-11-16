/** 仅复制现有第 10 槽，不改变 CSS、脚本、倒序和空槽隐藏逻辑。可重复运行。 */
export function expandSlider(source: string): string {
  const slots = [...source.matchAll(/\$sliderimg_(\d+|default)\|/g)].map(
    (m) => m[1],
  );
  const expected = (max: number) => [
    ...Array.from({ length: max }, (_, i) => String(max - i)),
    "default",
  ];
  if (JSON.stringify(slots) === JSON.stringify(expected(20))) return source;
  if (JSON.stringify(slots) !== JSON.stringify(expected(10)))
    throw new Error("Slider 槽位结构已变化，停止自动修改");
  const block = source.match(
    /<div class="swiper-slide"[^\n]*\$sliderimg_10\|[^\n]*<\/div>/,
  )?.[0];
  if (!block || !block.includes("$imgdis_10|"))
    throw new Error("未找到第 10 槽及隐藏参数");
  const added = Array.from({ length: 10 }, (_, i) =>
    block.replaceAll("_10|", `_${20 - i}|`),
  ).join("\n                    ");
  return source.replace(block, `${added}\n                    ${block}`);
}

/** 嵌套 filepath 模板含 }}，不能用非贪婪正则定位轮播末尾。 */
export function replaceCarousel(source: string, brandId: string): string {
  const replacement = `{{#Widget:SkinGalleryV2|mode=carousel|brand=${brandId}}}`;
  if (source.includes(replacement)) return source;
  const start = source.indexOf("{{时装回廊/轮播");
  if (start < 0 || source.indexOf("{{时装回廊/轮播", start + 1) !== -1)
    throw new Error("页面应恰有一个旧轮播模板");
  let depth = 0;
  for (let i = start; i < source.length - 1; i++) {
    const pair = source.slice(i, i + 2);
    if (pair === "{{") {
      depth++;
      i++;
    } else if (pair === "}}") {
      depth--;
      i++;
      if (!depth)
        return source.slice(0, start) + replacement + source.slice(i + 1);
    }
  }
  throw new Error("轮播模板括号不匹配");
}

export function replaceHome(source: string): string {
  const replacement = "{{#Widget:SkinGalleryV2}}";
  if (source.includes(replacement)) return source;
  if (source.split("{{时装回廊}}").length !== 2)
    throw new Error("首页应恰有一个时装回廊模板");
  // 保留模板本身作为期号/锚点数据源，SkinShop 仍依赖它。
  return source.replace("{{时装回廊}}", replacement);
}
