import {
  Filter,
  GlProgram,
  GpuProgram,
  UniformGroup,
  type TextureSource,
} from "pixi.js";

/**
 * Native port of the AVG blocker slide wipe: material
 * `AVG/[UC]Common/Arts/Materials/slide_mask` (asset `avg/[uc]common`), shader
 * `Torappu/UI/AVG/SlideMask` (asset `[uc]shaders/avg/ui-avg-slidemask`,
 * 2.7.61 decompiled GLES variant). The shader keys off the tweened Image
 * vertex color:
 *
 * ```
 * p     = clamp((color.a - 0.2) * 1.25, 0, 1)      // reveal progress
 * start = p * (_Slide + _End) - _End
 * span  = _End + p * (_Extent - _End)              // _Width | _Height
 * u     = (uv.<axis> - start) / span                // .x or .y (ENABLE_VERTICAL)
 * out   = (color.rgb, clamp(mask(u).a + color.a, 0, 1))
 * ```
 *
 * Material floats are baked from the serialized `slide_mask` Material:
 * `_Slide = 0.601`, `_End = 0.641`, `_Width = 0.787` (slider),
 * `_Height = 1.0` (verticalslider). `_MaskTex` is the 128x128 `slide_left`
 * ramp (opaque ~254 at u=0 falling to 0 at u=1, bilinear, clamp wrap), so
 * alpha <= 0.2 leaves only the uniform veil while alpha -> 1 sweeps a solid
 * slab with a feathered edge. `inverse` mirrors the mask coordinate (native
 * localScale = -1 flips the quad); `uVertical` is the ENABLE_VERTICAL
 * keyword.
 *
 * Web adaptation: the PIXI filter coordinate space is y-down, while the
 * Unity quad uv is y-up, so uv.y is inverted here before the formula.
 */

const SLIDE_MASK_VERTEX_GLSL = /* glsl */ `
in vec2 aPosition;

out vec2 vTextureCoord;

uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;

vec4 filterVertexPosition( void )
{
    vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;

    position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
    position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;

    return vec4(position, 0.0, 1.0);
}

vec2 filterTextureCoord( void )
{
    return aPosition * (uOutputFrame.zw * uInputSize.zw);
}

void main(void)
{
    gl_Position = filterVertexPosition();
    vTextureCoord = filterTextureCoord();
}
`;

const SLIDE_MASK_FRAGMENT_GLSL = /* glsl */ `
in vec2 vTextureCoord;

out vec4 finalColor;

uniform sampler2D uTexture;
uniform sampler2D uMaskTexture;

uniform float uAlpha;
uniform float uSlide;
uniform float uEnd;
uniform float uExtent;
uniform float uVertical;
uniform float uFlipX;
uniform float uFlipY;

void main(void)
{
    // Unity quad uv: x matches the filter coord, y is bottom-up; the native
    // inverse flip mirrors the axis before the mask lookup.
    vec2 uv = vec2(
        mix(vTextureCoord.x, 1.0 - vTextureCoord.x, uFlipX),
        mix(1.0 - vTextureCoord.y, vTextureCoord.y, uFlipY)
    );
    float progress = clamp((uAlpha - 0.2) * 1.25, 0.0, 1.0);
    float start = progress * (uSlide + uEnd) - uEnd;
    float span = uEnd + progress * (uExtent - uEnd);
    float coord = mix(uv.x, uv.y, uVertical);
    float other = mix(uv.y, uv.x, uVertical);
    float maskU = (coord - start) / span;
    float maskA = texture(uMaskTexture, vec2(maskU, other)).a;
    float alpha = clamp(maskA + uAlpha, 0.0, 1.0);
    vec4 base = texture(uTexture, vTextureCoord);
    finalColor = vec4(base.rgb * alpha, alpha);
}
`;

const SLIDE_MASK_WGSL = /* wgsl */ `
struct GlobalFilterUniforms {
  uInputSize:vec4<f32>,
  uInputPixel:vec4<f32>,
  uInputClamp:vec4<f32>,
  uOutputFrame:vec4<f32>,
  uGlobalFrame:vec4<f32>,
  uOutputTexture:vec4<f32>,
};

struct SlideMaskUniforms {
  uAlpha:f32,
  uSlide:f32,
  uEnd:f32,
  uExtent:f32,
  uVertical:f32,
  uFlipX:f32,
  uFlipY:f32,
}

@group(0) @binding(0) var<uniform> gfu: GlobalFilterUniforms;
@group(0) @binding(1) var uTexture: texture_2d<f32>;
@group(0) @binding(2) var uSampler : sampler;

@group(1) @binding(0) var<uniform> slideMaskUniforms : SlideMaskUniforms;
@group(1) @binding(1) var uMaskTexture: texture_2d<f32>;
@group(1) @binding(2) var uMaskSampler : sampler;

struct VSOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv : vec2<f32>,
  }

fn filterVertexPosition(aPosition:vec2<f32>) -> vec4<f32>
{
    var position = aPosition * gfu.uOutputFrame.zw + gfu.uOutputFrame.xy;

    position.x = position.x * (2.0 / gfu.uOutputTexture.x) - 1.0;
    position.y = position.y * (2.0*gfu.uOutputTexture.z / gfu.uOutputTexture.y) - gfu.uOutputTexture.z;

    return vec4(position, 0.0, 1.0);
}

fn filterTextureCoord( aPosition:vec2<f32> ) -> vec2<f32>
{
    return aPosition * (gfu.uOutputFrame.zw * gfu.uInputSize.zw);
}

@vertex
fn mainVertex(
  @location(0) aPosition : vec2<f32>,
) -> VSOutput {
    return VSOutput(
        filterVertexPosition(aPosition),
        filterTextureCoord(aPosition),
    );
}

@fragment
fn mainFragment(
  @location(0) uv: vec2<f32>,
) -> @location(0) vec4<f32> {
    let coord2 = vec2<f32>(
        mix(uv.x, 1.0 - uv.x, slideMaskUniforms.uFlipX),
        mix(1.0 - uv.y, uv.y, slideMaskUniforms.uFlipY)
    );
    let progress = clamp((slideMaskUniforms.uAlpha - 0.2) * 1.25, 0.0, 1.0);
    let start = progress * (slideMaskUniforms.uSlide + slideMaskUniforms.uEnd) - slideMaskUniforms.uEnd;
    let span = slideMaskUniforms.uEnd + progress * (slideMaskUniforms.uExtent - slideMaskUniforms.uEnd);
    let coord = mix(coord2.x, coord2.y, slideMaskUniforms.uVertical);
    let other = mix(coord2.y, coord2.x, slideMaskUniforms.uVertical);
    let maskU = (coord - start) / span;
    let maskA = textureSample(uMaskTexture, uMaskSampler, vec2<f32>(maskU, other)).a;
    let alpha = clamp(maskA + slideMaskUniforms.uAlpha, 0.0, 1.0);
    let base = textureSample(uTexture, uSampler, uv);
    return vec4<f32>(base.rgb * alpha, alpha);
}
`;

/** Material `slide_mask` serialized floats (see class docs). */
export const SLIDE_MASK_MATERIAL = {
  end: 0.641,
  slide: 0.601,
  width: 0.787,
} as const;

/** `_Height` — the vertical variant's `_Extent` source. */
export const SLIDE_MASK_HEIGHT = 1;

/** Typed view of the SlideMask UniformGroup (Record<string, unknown> raw). */
interface SlideMaskUniforms {
  uAlpha: number;
  uEnd: number;
  uExtent: number;
  uFlipX: number;
  uFlipY: number;
  uSlide: number;
  uVertical: number;
}

export class SlideMaskFilter extends Filter {
  public readonly filterUniforms: UniformGroup;

  private get u(): SlideMaskUniforms {
    return this.filterUniforms.uniforms as unknown as SlideMaskUniforms;
  }

  public constructor(maskSource: TextureSource) {
    const filterUniforms = new UniformGroup({
      uAlpha: { value: 0, type: "f32" },
      uSlide: { value: SLIDE_MASK_MATERIAL.slide, type: "f32" },
      uEnd: { value: SLIDE_MASK_MATERIAL.end, type: "f32" },
      uExtent: { value: SLIDE_MASK_MATERIAL.width, type: "f32" },
      uVertical: { value: 0, type: "f32" },
      uFlipX: { value: 0, type: "f32" },
      uFlipY: { value: 0, type: "f32" },
    });

    super({
      glProgram: GlProgram.from({
        fragment: SLIDE_MASK_FRAGMENT_GLSL,
        name: "slide-mask-filter",
        vertex: SLIDE_MASK_VERTEX_GLSL,
      }),
      // The app prefers WebGPU (see PixiStoryRenderer.mount), so both shader
      // backends must stay in sync -- the WGSL mirrors the GLSL exactly.
      gpuProgram: GpuProgram.from({
        fragment: {
          entryPoint: "mainFragment",
          source: SLIDE_MASK_WGSL,
        },
        vertex: {
          entryPoint: "mainVertex",
          source: SLIDE_MASK_WGSL,
        },
      }),
      padding: 0,
      resources: {
        // The resource key must equal the WGSL var name (`slideMaskUniforms`):
        // the Shader matches resources to @group/@binding slots by name, and
        // an unmatched key lands in the orphan group 99, leaving binding 1.0
        // empty -- WebGPU's BindGroupSystem then crashes reading
        // `undefined._resourceType` while walking the layout.
        slideMaskUniforms: filterUniforms,
        uMaskTexture: maskSource,
        uMaskSampler: maskSource.style,
      },
    });

    this.filterUniforms = filterUniforms;
  }

  /** The current tweened blocker alpha (raw float; clamped in-shader). */
  public set alpha(value: number) {
    this.u.uAlpha = value;
  }

  public get alpha(): number {
    return this.u.uAlpha;
  }

  /** ENABLE_VERTICAL keyword: samples the mask along uv.y and uses _Height. */
  public setVertical(vertical: boolean): void {
    this.u.uVertical = vertical ? 1 : 0;
    this.u.uExtent = vertical ? SLIDE_MASK_HEIGHT : SLIDE_MASK_MATERIAL.width;
  }

  public isVertical(): boolean {
    return this.u.uVertical === 1;
  }

  /** Mirrors for the persistent inverse flip (localScale = -1 per axis). */
  public setFlip(flipX: boolean, flipY: boolean): void {
    this.u.uFlipX = flipX ? 1 : 0;
    this.u.uFlipY = flipY ? 1 : 0;
  }
}
