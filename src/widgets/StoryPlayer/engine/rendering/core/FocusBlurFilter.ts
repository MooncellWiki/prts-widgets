import {
  defaultFilterVert,
  Filter,
  GlProgram,
  GpuProgram,
  Texture,
  TexturePool,
  UniformGroup,
  type FilterSystem,
  type RenderSurface,
} from "pixi.js";

import { COLOR_EFFECT_LUMA } from "./ColorEffectMatrix";

import type { FocusColorMode } from "../../types";

const glsl = /* glsl */ `
in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform vec4 uInputPixel;
uniform vec4 uInputClamp;

vec4 sampleInput(vec2 uv) {
  return texture(uTexture, clamp(uv, uInputClamp.xy, uInputClamp.zw));
}
`;

const wgsl = /* wgsl */ `
struct GlobalFilterUniforms {
  uInputSize: vec4<f32>,
  uInputPixel: vec4<f32>,
  uInputClamp: vec4<f32>,
  uOutputFrame: vec4<f32>,
  uGlobalFrame: vec4<f32>,
  uOutputTexture: vec4<f32>,
}

@group(0) @binding(0) var<uniform> gfu: GlobalFilterUniforms;
@group(0) @binding(1) var uTexture: texture_2d<f32>;
@group(0) @binding(2) var uSampler: sampler;

struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
}

@vertex
fn mainVertex(@location(0) aPosition: vec2<f32>) -> VertexOutput {
  let position = aPosition * gfu.uOutputFrame.zw + gfu.uOutputFrame.xy;
  let ndc = position * 2.0 / gfu.uOutputTexture.xy - vec2<f32>(1.0);
  return VertexOutput(
    vec4<f32>(ndc.x, ndc.y * gfu.uOutputTexture.z, 0.0, 1.0),
    aPosition * gfu.uOutputFrame.zw * gfu.uInputSize.zw,
  );
}

// The downsample pass fills a whole scratch texture of a different size.
@vertex
fn downsampleVertex(@location(0) aPosition: vec2<f32>) -> VertexOutput {
  return VertexOutput(
    vec4<f32>(aPosition * 2.0 - vec2<f32>(1.0), 0.0, 1.0),
    aPosition * gfu.uOutputFrame.zw * gfu.uInputSize.zw,
  );
}

fn sampleInput(uv: vec2<f32>) -> vec4<f32> {
  return textureSample(uTexture, uSampler, clamp(uv, gfu.uInputClamp.xy, gfu.uInputClamp.zw));
}
`;

const downsampleVertex = /* glsl */ `
in vec2 aPosition;
out vec2 vTextureCoord;
uniform vec4 uInputSize;
uniform vec4 uOutputFrame;

void main() {
  gl_Position = vec4(aPosition * 2.0 - 1.0, 0.0, 1.0);
  vTextureCoord = aPosition * uOutputFrame.zw * uInputSize.zw;
}
`;

function programs(
  name: string,
  glFragment: string,
  gpuFragment: string,
  downsample = false,
) {
  const source = wgsl + gpuFragment;
  return {
    glProgram: GlProgram.from({
      fragment: glsl + glFragment,
      name,
      preferredFragmentPrecision: "highp",
      vertex: downsample ? downsampleVertex : defaultFilterVert,
    }),
    gpuProgram: GpuProgram.from({
      fragment: { entryPoint: "mainFragment", source },
      name,
      vertex: {
        entryPoint: downsample ? "downsampleVertex" : "mainVertex",
        source,
      },
    }),
  };
}

// 2791 PC globalgamemanagers.assets, MobileBlur (PathID 21). Pass 0
// offsets are expressed here in Pixi's top-down texture coordinates.
function downsamplePass(): Filter {
  const offsets = ["1.0, -1.0", "-0.5, 0.5", "0.5, 0.5", "-0.5, -0.5"];
  const taps = (vector: string) =>
    offsets
      .map((xy) => `sampleInput(uv + ${vector}(${xy}) * texel)`)
      .join(" + ");
  return new Filter(
    programs(
      "focus-blur-downsample",
      /* glsl */ `
void main() {
  vec2 uv = vTextureCoord;
  vec2 texel = uInputPixel.zw;
  finalColor = (${taps("vec2")}) * 0.25;
}
`,
      /* wgsl */ `
@fragment
fn mainFragment(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
  let texel = gfu.uInputPixel.zw;
  return (${taps("vec2<f32>")}) * 0.25;
}
`,
      true,
    ),
  );
}

function blurPass(axis: "horizontal" | "vertical"): Filter {
  const direction = axis === "horizontal" ? "1.0, 0.0" : "0.0, 1.0";
  const weights = [0.0205, 0.0855, 0.232, 0.324, 0.232, 0.0855, 0.0205];
  const taps = weights
    .map(
      (weight, index) => `sampleInput(uv + ${index - 3}.0 * delta) * ${weight}`,
    )
    .join("\n    + ");
  return new Filter(
    programs(
      `focus-blur-${axis}`,
      /* glsl */ `
void main() {
  vec2 uv = vTextureCoord;
  vec2 delta = vec2(${direction}) * uInputPixel.zw;
  finalColor = ${taps};
}
`,
      /* wgsl */ `
@fragment
fn mainFragment(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
  let delta = vec2<f32>(${direction}) * gfu.uInputPixel.zw;
  return ${taps};
}
`,
    ),
  );
}

// Build the same premultiplied RGB expression in both shader languages.
const mixFocus = (vector: string) => `
  rgb = mix(rgb, ${vector}(dot(rgb, ${vector}(${COLOR_EFFECT_LUMA.join(", ")}))), uGray);
  rgb = mix(rgb, ${vector}(clean.a) - rgb, uInverse);
`;

/** 2791 AVGSceneFocusOut.Render (0x1841FA6A0) + MobileBlur + mat_blit_ghost.
 * The Web runs those taps in scene pixels on each flattened focus target.
 * It keeps that target's clean alpha as coverage when mixing in blurred RGB.
 */
export class FocusBlurFilter extends Filter {
  private readonly downsample = downsamplePass();
  private readonly vertical = blurPass("vertical");
  private readonly horizontal = blurPass("horizontal");
  private readonly uniforms: {
    uBlurClamp: Float32Array;
    uBlurScale: Float32Array;
    uAmount: number;
    uGray: number;
    uInverse: number;
  };

  constructor() {
    const focusBlurUniforms = new UniformGroup({
      uBlurClamp: { type: "vec4<f32>", value: new Float32Array(4) },
      uBlurScale: { type: "vec2<f32>", value: new Float32Array(2) },
      uAmount: { type: "f32", value: 0 },
      uGray: { type: "f32", value: 0 },
      uInverse: { type: "f32", value: 0 },
    });
    super({
      ...programs(
        "focus-blur-blend",
        /* glsl */ `
uniform sampler2D uBlurredTexture;
uniform vec2 uBlurScale;
uniform vec4 uBlurClamp;
uniform float uAmount;
uniform float uGray;
uniform float uInverse;

void main() {
  vec4 clean = sampleInput(vTextureCoord);
  vec2 blurUv = clamp(vTextureCoord * uBlurScale, uBlurClamp.xy, uBlurClamp.zw);
  vec4 blurred = texture(uBlurredTexture, blurUv);
  vec3 rgb = blurred.a > 0.0 ? blurred.rgb * (clean.a / blurred.a) : clean.rgb;
  ${mixFocus("vec3")}
  finalColor = vec4(mix(clean.rgb, rgb, uAmount), clean.a);
}
`,
        /* wgsl */ `
struct FocusBlurUniforms {
  uBlurClamp: vec4<f32>,
  uBlurScale: vec2<f32>,
  uAmount: f32,
  uGray: f32,
  uInverse: f32,
}

@group(1) @binding(0) var<uniform> focusBlurUniforms: FocusBlurUniforms;
@group(1) @binding(1) var uBlurredTexture: texture_2d<f32>;
@group(1) @binding(2) var uBlurredSampler: sampler;

@fragment
fn mainFragment(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
  let clean = sampleInput(uv);
  let blurUv = clamp(uv * focusBlurUniforms.uBlurScale, focusBlurUniforms.uBlurClamp.xy, focusBlurUniforms.uBlurClamp.zw);
  let blurred = textureSample(uBlurredTexture, uBlurredSampler, blurUv);
  let uGray = focusBlurUniforms.uGray;
  let uInverse = focusBlurUniforms.uInverse;
  var rgb = clean.rgb;
  if (blurred.a > 0.0) {
    rgb = blurred.rgb * (clean.a / blurred.a);
  }
  ${mixFocus("vec3<f32>")}
  return vec4<f32>(mix(clean.rgb, rgb, focusBlurUniforms.uAmount), clean.a);
}
`,
      ),
      antialias: "inherit",
      resolution: "inherit",
      resources: {
        focusBlurUniforms,
        uBlurredTexture: Texture.EMPTY.source,
        uBlurredSampler: Texture.EMPTY.source.style,
      },
    });
    this.uniforms = focusBlurUniforms.uniforms;
  }

  get amount(): number {
    return this.uniforms.uAmount;
  }

  setBlend(amount: number, color: FocusColorMode): void {
    this.uniforms.uAmount = amount;
    this.uniforms.uGray = Number(color === "Grayscale");
    this.uniforms.uInverse = Number(color === "Colorinverse");
  }

  override apply(
    system: FilterSystem,
    input: Texture,
    output: RenderSurface,
    clear: boolean,
  ): void {
    // Match the 960×540 high-resolution DS target at 1280×720. Smaller
    // canvases keep their input resolution when it is already below that cap.
    const resolution = Math.min(input.source.resolution, 0.75);
    const size = {
      width: Math.max(1, Math.round(input.frame.width * resolution)),
      height: Math.max(1, Math.round(input.frame.height * resolution)),
      scaleMode: "linear" as const,
    };
    const first = TexturePool.getOptimalTexture(size);
    const second = TexturePool.getOptimalTexture(size);
    try {
      system.applyFilter(this.downsample, input, first, true);
      system.applyFilter(this.vertical, first, second, true);
      system.applyFilter(this.horizontal, second, first, true);

      const { pixelWidth, pixelHeight } = first.source;
      this.uniforms.uBlurScale.set([
        (size.width / pixelWidth) * (input.source.width / input.frame.width),
        (size.height / pixelHeight) *
          (input.source.height / input.frame.height),
      ]);
      this.uniforms.uBlurClamp.set([
        0.5 / pixelWidth,
        0.5 / pixelHeight,
        (size.width - 0.5) / pixelWidth,
        (size.height - 0.5) / pixelHeight,
      ]);
      this.resources.uBlurredTexture = first.source;
      this.resources.uBlurredSampler = first.source.style;
      system.applyFilter(this, input, output, clear);
    } finally {
      TexturePool.returnTexture(second);
      TexturePool.returnTexture(first);
    }
  }

  override destroy(): void {
    this.downsample.destroy();
    this.vertical.destroy();
    this.horizontal.destroy();
    super.destroy();
  }
}
