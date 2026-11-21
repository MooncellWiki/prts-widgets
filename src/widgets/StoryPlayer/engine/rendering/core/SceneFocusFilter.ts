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

import type { FocusParamInput } from "../../types";

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
  let ndc = aPosition * 2.0 - vec2<f32>(1.0);
  return VertexOutput(
    vec4<f32>(ndc.x, ndc.y * gfu.uOutputTexture.z, 0.0, 1.0),
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
uniform vec4 uOutputTexture;

void main() {
  vec2 ndc = aPosition * 2.0 - 1.0;
  gl_Position = vec4(ndc.x, ndc.y * uOutputTexture.z, 0.0, 1.0);
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
  return new Filter({
    ...programs(
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
    blendMode: "none",
  });
}

function blurPass(axis: "horizontal" | "vertical"): Filter {
  const direction = axis === "horizontal" ? "1.0, 0.0" : "0.0, 1.0";
  const weights = [0.0205, 0.0855, 0.232, 0.324, 0.232, 0.0855, 0.0205];
  const taps = weights
    .map(
      (weight, index) => `sampleInput(uv + ${index - 3}.0 * delta) * ${weight}`,
    )
    .join("\n    + ");
  return new Filter({
    ...programs(
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
    blendMode: "none",
  });
}

/** AVGSceneFocusOut.Render (2791 @ 0x1841FA6A0), MobileBlur and mat_blit_ghost. */
export class SceneFocusFilter extends Filter {
  private readonly downsample = downsamplePass();
  private readonly vertical = blurPass("vertical");
  private readonly horizontal = blurPass("horizontal");
  private readonly colorUniforms = new UniformGroup({
    uGray: { type: "f32", value: 0 },
    uInverse: { type: "f32", value: 0 },
  });
  private readonly color = new Filter({
    ...programs(
      "story-focus-color",
      /* glsl */ `
uniform float uGray;
uniform float uInverse;

void main() {
  vec4 color = sampleInput(vTextureCoord);
  color = mix(color, 1.0 - color, uInverse);
  float luma = dot(color.rgb, vec3(${COLOR_EFFECT_LUMA.join(", ")}));
  finalColor = vec4(mix(color.rgb, vec3(luma), uGray), color.a);
}
`,
      /* wgsl */ `
struct ColorUniforms {
  uGray: f32,
  uInverse: f32,
}
@group(1) @binding(0) var<uniform> colorUniforms: ColorUniforms;

@fragment
fn mainFragment(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
  var color = sampleInput(uv);
  color = mix(color, vec4<f32>(1.0) - color, colorUniforms.uInverse);
  let luma = dot(color.rgb, vec3<f32>(${COLOR_EFFECT_LUMA.join(", ")}));
  return vec4<f32>(mix(color.rgb, vec3<f32>(luma), colorUniforms.uGray), color.a);
}
`,
    ),
    blendMode: "none",
    resources: { colorUniforms: this.colorUniforms },
  });
  private readonly uniforms;
  private config: FocusParamInput = { blur: true, color: "None" };

  // GraphicUtil.GetHighResRTSize (2791 @ 0x18697F8D0) doubles this cap.
  // Use the 960 tier by default as matched against the M2 recording.
  constructor(private readonly highResolution = true) {
    const compositeUniforms = new UniformGroup({
      uProcessedClamp: { type: "vec4<f32>", value: new Float32Array(4) },
      uProcessedScale: { type: "vec2<f32>", value: new Float32Array(2) },
    });
    super({
      ...programs(
        "story-focus-composite",
        /* glsl */ `
uniform sampler2D uProcessedTexture;
uniform vec2 uProcessedScale;
uniform vec4 uProcessedClamp;

void main() {
  vec4 clean = sampleInput(vTextureCoord);
  vec2 uv = clamp(vTextureCoord * uProcessedScale, uProcessedClamp.xy, uProcessedClamp.zw);
  vec3 processed = texture(uProcessedTexture, uv).rgb;
  finalColor = vec4(mix(processed, clean.rgb, clean.a), 1.0);
}
`,
        /* wgsl */ `
struct CompositeUniforms {
  uProcessedClamp: vec4<f32>,
  uProcessedScale: vec2<f32>,
}

@group(1) @binding(0) var<uniform> compositeUniforms: CompositeUniforms;
@group(1) @binding(1) var uProcessedTexture: texture_2d<f32>;
@group(1) @binding(2) var uProcessedSampler: sampler;

@fragment
fn mainFragment(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
  let clean = sampleInput(uv);
  let processedUv = clamp(uv * compositeUniforms.uProcessedScale, compositeUniforms.uProcessedClamp.xy, compositeUniforms.uProcessedClamp.zw);
  let processed = textureSample(uProcessedTexture, uProcessedSampler, processedUv).rgb;
  return vec4<f32>(mix(processed, clean.rgb, clean.a), 1.0);
}
`,
      ),
      antialias: "off",
      resolution: "inherit",
      resources: {
        compositeUniforms,
        uProcessedTexture: Texture.EMPTY.source,
        uProcessedSampler: Texture.EMPTY.source.style,
      },
    });
    this.uniforms = compositeUniforms.uniforms;
  }

  configure(config: FocusParamInput): void {
    this.config = config;
    this.colorUniforms.uniforms.uGray = Number(config.color === "Grayscale");
    this.colorUniforms.uniforms.uInverse = Number(
      config.color === "Colorinverse",
    );
  }

  override apply(
    system: FilterSystem,
    input: Texture,
    output: RenderSurface,
    clear: boolean,
  ): void {
    const { blur, color } = this.config;
    const resolution = input.source.resolution;
    const width = input.frame.width * resolution;
    const height = input.frame.height * resolution;
    const cap = this.highResolution ? 960 : 480;
    const scale = Math.min(1, cap / Math.max(width, height));
    const size = {
      width: blur ? Math.max(1, Math.round(width * scale)) : input.frame.width,
      height: blur
        ? Math.max(1, Math.round(height * scale))
        : input.frame.height,
      resolution: blur ? 1 : resolution,
      format: "rgba8unorm" as const,
      scaleMode: "linear" as const,
    };
    const first = TexturePool.getOptimalTexture(size);
    const second = blur ? TexturePool.getOptimalTexture(size) : undefined;
    try {
      let processed = first;
      if (second) {
        system.applyFilter(this.downsample, input, first, true);
        let next = second;
        if (color !== "None") {
          system.applyFilter(this.color, processed, next, true);
          [processed, next] = [next, processed];
        }
        system.applyFilter(this.vertical, processed, next, true);
        system.applyFilter(this.horizontal, next, processed, true);
      } else {
        system.applyFilter(this.color, input, first, true);
      }

      const source = processed.source;
      const { width: frameWidth, height: frameHeight } = processed.frame;
      const { pixelWidth, pixelHeight } = source;
      this.uniforms.uProcessedScale.set([
        (frameWidth / source.width) * (input.source.width / input.frame.width),
        (frameHeight / source.height) *
          (input.source.height / input.frame.height),
      ]);
      this.uniforms.uProcessedClamp.set([
        0.5 / pixelWidth,
        0.5 / pixelHeight,
        (frameWidth * source.resolution - 0.5) / pixelWidth,
        (frameHeight * source.resolution - 0.5) / pixelHeight,
      ]);
      this.resources.uProcessedTexture = source;
      this.resources.uProcessedSampler = source.style;
      system.applyFilter(this, input, output, clear);
    } finally {
      this.resources.uProcessedTexture = Texture.EMPTY.source;
      this.resources.uProcessedSampler = Texture.EMPTY.source.style;
      if (second) TexturePool.returnTexture(second);
      TexturePool.returnTexture(first);
    }
  }

  override destroy(): void {
    this.downsample.destroy();
    this.vertical.destroy();
    this.horizontal.destroy();
    this.color.destroy();
    super.destroy();
  }
}
