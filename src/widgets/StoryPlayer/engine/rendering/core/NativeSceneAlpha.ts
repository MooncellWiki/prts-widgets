import {
  WebGLRenderer,
  type WebGPURenderer,
  type BLEND_MODES,
  type Renderer,
} from "pixi.js";

export const ghostAlphaBlend = "story-ghost-alpha" as BLEND_MODES;
export const characterAlphaBlend = "story-character-alpha" as BLEND_MODES;

const installed = new WeakSet<Renderer>();

/**
 * 2791 Torappu/AVG/AlphaGhost writes A with BlendOp RevSub and factors One,
 * One. AVG_Char_AlphaSplit uses SrcAlpha, OneMinusSrcAlpha for both channels.
 * Pixi already premultiplies the sprite's RGB, so only its A factors change.
 */
export function installSceneAlphaBlends(
  renderer: WebGLRenderer | WebGPURenderer,
): void {
  if (installed.has(renderer)) return;
  installed.add(renderer);

  if (renderer instanceof WebGLRenderer) {
    // Pixi 8.22 rebuilds this per-renderer table after context restoration.
    const contextChange = () => {
      const gl = renderer.gl;
      const { blendModesMap: modes } = renderer.state as unknown as {
        blendModesMap: Record<string, number[]>;
      };
      modes[ghostAlphaBlend] = [
        gl.ZERO,
        gl.ONE,
        gl.ONE,
        gl.ONE,
        gl.FUNC_ADD,
        gl.FUNC_REVERSE_SUBTRACT,
      ];
      modes[characterAlphaBlend] = [
        gl.ONE,
        gl.ONE_MINUS_SRC_ALPHA,
        gl.SRC_ALPHA,
        gl.ONE_MINUS_SRC_ALPHA,
      ];
    };
    contextChange();
    renderer.runners.contextChange!.add({ contextChange });
    return;
  }

  const normal: GPUBlendComponent = {
    operation: "add",
    srcFactor: "one",
    dstFactor: "one-minus-src-alpha",
  };
  const blends = new Map<BLEND_MODES, GPUBlendState>([
    [
      ghostAlphaBlend,
      {
        color: { operation: "add", srcFactor: "zero", dstFactor: "one" },
        alpha: {
          operation: "reverse-subtract",
          srcFactor: "one",
          dstFactor: "one",
        },
      },
    ],
    [
      characterAlphaBlend,
      { color: normal, alpha: { ...normal, srcFactor: "src-alpha" } },
    ],
  ]);
  const getTargets = renderer.state.getColorTargets.bind(renderer.state);
  renderer.state.getColorTargets = (state, count, format) => {
    const targets = getTargets(state, count, format);
    const blend = blends.get(state.blendMode);
    if (blend) for (const target of targets) target.blend = blend;
    return targets;
  };

  // Pixi 8.22 assigns unrecognized names the same cache ID as "normal".
  // Reserve distinct IDs after the built-in 0..10 for this renderer only.
  const getPipeline = renderer.pipeline.getPipeline.bind(renderer.pipeline);
  renderer.pipeline.getPipeline = (geometry, program, state, ...options) => {
    const nativeBlend = state.blendMode;
    if (!blends.has(nativeBlend))
      return getPipeline(geometry, program, state, ...options);

    const previous = state._blendModeId;
    state._blendModeId = nativeBlend === ghostAlphaBlend ? 11 : 12;
    try {
      return getPipeline(geometry, program, state, ...options);
    } finally {
      state._blendModeId = previous;
    }
  };
}
