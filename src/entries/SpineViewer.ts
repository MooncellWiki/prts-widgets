import "virtual:uno.css";
import { createApp } from "vue";

import SpineVue, { Props } from "../widgets/Spine/Wrapper.vue";
import { Spine } from "../widgets/Spine/spine";

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error
window.SpineApi = Spine;
window.dispatchEvent(new Event("spine_api_ready"));
async function main() {
  const ele = document.querySelector<HTMLElement>("#spine-root");
  let spineData: Props | null = null;
  if (!ele?.dataset.id) {
    spineData = JSON.parse(
      document.querySelector("#SPINEDATA")!.innerHTML,
    ) as Props;
    spineData.prefix = spineData.prefix.replace(
      "https://static.prts.wiki/spine/",
      "https://static.prts.wiki/spine38/",
    );
  }
  // 一个临时的patch 这个变更在spine runtime 4.1上 要是以后升到4.1了就可以删掉了
  // 现在的spine runtime渲染的时候 给blendFunc传的都是gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA
  // https://github.com/EsotericSoftware/spine-runtimes/commit/78a730a6d78241add86bef41aa26530567bc11dc#diff-b88f26766af82544f5c7781e19787743f71b053a06d24e7ee0bc6fe7975f2f72L63-L73
  // 有的spine不需要这个patch (比如年的)
  if (!ele?.dataset.disablePatch) {
    WebGL2RenderingContext.prototype.blendFunc = function (_a, _b) {
      WebGL2RenderingContext.prototype.blendFuncSeparate.call(
        this,
        WebGL2RenderingContext.SRC_ALPHA,
        WebGL2RenderingContext.ONE_MINUS_SRC_ALPHA,
        WebGL2RenderingContext.ONE,
        WebGL2RenderingContext.ONE_MINUS_SRC_ALPHA,
      );
    };
  }

  if (ele)
    createApp(SpineVue, { conf: spineData, id: ele?.dataset.id }).mount(ele);
  else console.error("SPINEDATA or ele not found", ele);
}

main();
