import { createApp, defineComponent, h, nextTick } from "vue";

import { expect, it, vi } from "vitest";

import AssetListModal from "../../src/widgets/StoryPlayer/components/AssetListModal.vue";
import { saveBlob } from "../../src/widgets/StoryPlayer/components/download";

const exportComposite = vi.hoisted(() => vi.fn<() => Promise<Blob>>());
vi.mock(
  "../../src/widgets/StoryPlayer/components/CharacterFacePreview.vue",
  () => ({
    default: defineComponent({
      setup(_, { expose }) {
        expose({ exportComposite });
        return () => h("canvas");
      },
    }),
  }),
);
vi.mock("../../src/widgets/StoryPlayer/components/download", () => ({
  downloadAsset: vi.fn(),
  saveBlob: vi.fn(),
}));

it("keeps overlapping composite downloads with their original characters", async () => {
  const alpha = Promise.withResolvers<Blob>();
  const beta = Promise.withResolvers<Blob>();
  exportComposite
    .mockReturnValueOnce(alpha.promise)
    .mockReturnValueOnce(beta.promise);
  const urls = ["/alpha.png", "/beta.png"];
  const app = createApp(AssetListModal, {
    show: true,
    urls,
    faceAssets: urls.map((baseUrl) => ({
      baseUrl,
      expression: "face0",
      faceRect: { x: 0, y: 0, w: 1, h: 1 },
      faceUrl: baseUrl.replace(".png", "_face0.png"),
      used: true,
    })),
  });
  const host = document.createElement("div");
  document.body.append(host);
  app.mount(host);
  try {
    const characters = host.querySelectorAll<HTMLButtonElement>(".asset-faces");
    const composite = () =>
      host.querySelector<HTMLButtonElement>(".face-downloads button")!;
    characters[0]!.click();
    await nextTick();
    composite().click();
    await nextTick();
    expect(composite().disabled).toBe(true);
    host
      .querySelector<HTMLButtonElement>(
        '.character-face-dialog [aria-label="关闭"]',
      )!
      .click();
    await nextTick();
    characters[1]!.click();
    await nextTick();
    expect(composite().disabled).toBe(false);
    composite().click();

    const alphaBlob = new Blob(["alpha"]);
    alpha.resolve(alphaBlob);
    await alpha.promise;
    await nextTick();
    expect(saveBlob).toHaveBeenNthCalledWith(1, alphaBlob, "alpha_face0.png");
    expect(composite().disabled).toBe(true);

    const betaBlob = new Blob(["beta"]);
    beta.resolve(betaBlob);
    await beta.promise;
    await nextTick();
    expect(saveBlob).toHaveBeenNthCalledWith(2, betaBlob, "beta_face0.png");
    expect(composite().disabled).toBe(false);
  } finally {
    app.unmount();
    host.remove();
  }
});
