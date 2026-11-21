import {
  compileHighShaderGlProgram,
  compileHighShaderGpuProgram,
  localUniformBit,
  localUniformBitGl,
  Matrix,
  Mesh,
  MeshGeometry,
  roundPixelsBit,
  roundPixelsBitGl,
  Shader,
  type Sprite,
  Texture,
  TilingSprite,
  UniformGroup,
} from "pixi.js";

import { ghostAlphaBlend } from "./NativeSceneAlpha";

import type { StoryFaceRect } from "../../types";

export type FocusDrawable = Sprite | TilingSprite;

export interface FocusExpression {
  body: Texture;
  face: Texture;
  rect: StoryFaceRect;
}

const quad = new MeshGeometry({
  positions: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
  uvs: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
  indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
});

// AlphaGhost pixel programs 5 and 6 from PC 2791 [uc]shaders.ab.
// mat_ghost_front enables DISTORT, with _RimScale=3 and _RimLerp=1.
const rimTaps = (vec2: string) =>
  ["-1.0, -1.0", "-1.0, 1.0", "1.0, -1.0", "1.0, 1.0"]
    .map((direction) => `alphaAt(vUV, ${vec2}(${direction}))`)
    .join(" + ");

const gpuGhost = {
  name: "story-focus-ghost",
  fragment: {
    header: /* wgsl */ `
struct GhostUniforms {
  uImageMap: mat3x3<f32>,
  uBodyMap: mat3x3<f32>,
  uFaceMap: mat3x3<f32>,
  uBodyClamp: vec4<f32>,
  uFaceClamp: vec4<f32>,
  uFaceRegion: vec4<f32>,
  uRimStep: vec4<f32>,
  uTiled: f32,
  uHasFace: f32,
}

@group(2) @binding(0) var<uniform> ghost: GhostUniforms;
@group(2) @binding(1) var uBody: texture_2d<f32>;
@group(2) @binding(2) var uBodySampler: sampler;
@group(2) @binding(3) var uFace: texture_2d<f32>;
@group(2) @binding(4) var uFaceSampler: sampler;

fn alphaAt(uv: vec2<f32>, tap: vec2<f32>) -> f32 {
  let imageUv = (ghost.uImageMap * vec3<f32>(uv, 1.0)).xy;
  let faceUv = (imageUv - ghost.uFaceRegion.xy) * ghost.uFaceRegion.zw + tap * ghost.uRimStep.zw;
  if (ghost.uHasFace > 0.5 && all(faceUv >= vec2<f32>(0.0)) && all(faceUv <= vec2<f32>(1.0))) {
    let mapped = (ghost.uFaceMap * vec3<f32>(faceUv, 1.0)).xy;
    let coord = clamp(mapped, ghost.uFaceClamp.xy, ghost.uFaceClamp.zw);
    return textureSampleLevel(uFace, uFaceSampler, coord, 0.0).a;
  }
  var bodyUv = imageUv + tap * ghost.uRimStep.xy;
  if (ghost.uTiled > 0.5) { bodyUv = fract(bodyUv); }
  let mapped = (ghost.uBodyMap * vec3<f32>(bodyUv, 1.0)).xy;
  let coord = clamp(mapped, ghost.uBodyClamp.xy, ghost.uBodyClamp.zw);
  return textureSampleLevel(uBody, uBodySampler, coord, 0.0).a;
}
`,
    main: /* wgsl */ `
var coverage = alphaAt(vUV, vec2<f32>(0.0));
if (ghost.uRimStep.x > 0.0) {
  coverage = min(1.0, coverage + ${rimTaps("vec2<f32>")});
}
if (coverage < 0.01) { discard; }
outColor = vec4<f32>(0.0, 0.0, 0.0, coverage);
`,
  },
};

const glGhost = {
  name: gpuGhost.name,
  fragment: {
    header: /* glsl */ `
precision highp float;
uniform mat3 uImageMap;
uniform mat3 uBodyMap;
uniform mat3 uFaceMap;
uniform vec4 uBodyClamp;
uniform vec4 uFaceClamp;
uniform vec4 uFaceRegion;
uniform vec4 uRimStep;
uniform float uTiled;
uniform float uHasFace;
uniform sampler2D uBody;
uniform sampler2D uFace;

float alphaAt(vec2 uv, vec2 tap) {
  vec2 imageUv = (uImageMap * vec3(uv, 1.0)).xy;
  vec2 faceUv = (imageUv - uFaceRegion.xy) * uFaceRegion.zw + tap * uRimStep.zw;
  if (uHasFace > 0.5 && all(greaterThanEqual(faceUv, vec2(0.0))) && all(lessThanEqual(faceUv, vec2(1.0)))) {
    vec2 coord = (uFaceMap * vec3(faceUv, 1.0)).xy;
    return texture(uFace, clamp(coord, uFaceClamp.xy, uFaceClamp.zw)).a;
  }
  vec2 bodyUv = imageUv + tap * uRimStep.xy;
  if (uTiled > 0.5) bodyUv = fract(bodyUv);
  vec2 coord = (uBodyMap * vec3(bodyUv, 1.0)).xy;
  return texture(uBody, clamp(coord, uBodyClamp.xy, uBodyClamp.zw)).a;
}
`,
    main: /* glsl */ `
float coverage = alphaAt(vUV, vec2(0.0));
if (uRimStep.x > 0.0) {
  coverage = min(1.0, coverage + ${rimTaps("vec2")});
}
if (coverage < 0.01) discard;
outColor = vec4(0.0, 0.0, 0.0, coverage);
`,
  },
};

/**
 * AVGAlphaGhostGraphic.BaseItem._CreateGhostGraphic (2791 @ 0x1841D63C0).
 * Attaching a noninteractive draw to the Image lets Pixi emit it immediately
 * after the host with its transform, clip, inherited opacity and sort order.
 */
export class FocusGhost extends Mesh<MeshGeometry, Shader> {
  private readonly ghostUniforms;

  constructor(private readonly host: FocusDrawable) {
    const ghostUniforms = new UniformGroup({
      uImageMap: { value: new Matrix(), type: "mat3x3<f32>" },
      uBodyMap: { value: new Matrix(), type: "mat3x3<f32>" },
      uFaceMap: { value: new Matrix(), type: "mat3x3<f32>" },
      uBodyClamp: { value: new Float32Array(4), type: "vec4<f32>" },
      uFaceClamp: { value: new Float32Array(4), type: "vec4<f32>" },
      uFaceRegion: { value: new Float32Array(4), type: "vec4<f32>" },
      uRimStep: { value: new Float32Array(4), type: "vec4<f32>" },
      uTiled: { value: 0, type: "f32" },
      uHasFace: { value: 0, type: "f32" },
    });
    const source = Texture.EMPTY.source;
    const shader = new Shader({
      glProgram: compileHighShaderGlProgram({
        bits: [localUniformBitGl, roundPixelsBitGl, glGhost],
        name: glGhost.name,
      }),
      gpuProgram: compileHighShaderGpuProgram({
        bits: [localUniformBit, roundPixelsBit, gpuGhost],
        name: gpuGhost.name,
      }),
      resources: {
        ghost: ghostUniforms,
        uBody: source,
        uBodySampler: source.style,
        uFace: source,
        uFaceSampler: source.style,
      },
    });
    super({
      blendMode: ghostAlphaBlend,
      eventMode: "none",
      geometry: quad,
      shader,
    });
    this.ghostUniforms = ghostUniforms;
    host.allowChildren = true;
    host.addChild(this);
  }

  sync(amount: number, soft: boolean, expression?: FocusExpression): void {
    const { host } = this;
    const tiled = host instanceof TilingSprite;
    const { texture } = host;
    const body = expression?.body ?? texture;
    const face = expression?.face ?? Texture.EMPTY;
    const width = tiled ? host.width : texture.width;
    const height = tiled ? host.height : texture.height;
    const u = this.ghostUniforms.uniforms;

    // Use the host's quad and texture coordinates. The parent's masks and
    // transforms are shared with this draw.
    u.uImageMap.identity();
    this.alpha = amount;
    if (tiled) {
      this.position.set(-host.anchor.x * width, -host.anchor.y * height);
      this.scale.set(width, height);
      const { a, b, c, d, tx, ty } = host.tileTransform.matrix;
      // Same UV transform as Pixi's TilingSpriteShader.
      u.uImageMap
        .set(
          (a * body.width) / width,
          (b * body.width) / height,
          (c * body.height) / width,
          (d * body.height) / height,
          tx / width,
          ty / height,
        )
        .invert();
    } else {
      const { minX, minY, maxX, maxY } = host.visualBounds;
      this.position.set(minX, minY);
      this.scale.set(maxX - minX, maxY - minY);
      const trim = texture.trim;
      if (trim) {
        u.uImageMap.set(
          trim.width / width,
          0,
          0,
          trim.height / height,
          trim.x / width,
          trim.y / height,
        );
      }
    }
    u.uTiled = Number(tiled);
    u.uHasFace = Number(Boolean(expression));
    u.uBodyMap = body.textureMatrix.mapCoord;
    u.uFaceMap = face.textureMatrix.mapCoord;
    u.uBodyClamp.set(body.textureMatrix.uClampFrame);
    u.uFaceClamp.set(face.textureMatrix.uClampFrame);
    if (expression) {
      const { x, y, w, h } = expression.rect;
      u.uFaceRegion.set([
        x / body.width,
        y / body.height,
        body.width / w,
        body.height / h,
      ]);
    }
    const rim = soft ? 3 : 0;
    u.uRimStep.set([
      rim / Math.max(1, body.width * body.source.resolution),
      rim / Math.max(1, body.height * body.source.resolution),
      rim / Math.max(1, face.width * face.source.resolution),
      rim / Math.max(1, face.height * face.source.resolution),
    ]);
    this.shader!.resources.uBody = body.source;
    this.shader!.resources.uBodySampler = body.source.style;
    this.shader!.resources.uFace = face.source;
    this.shader!.resources.uFaceSampler = face.source.style;
  }

  override destroy(): void {
    if (this.destroyed) return;
    this.shader?.destroy();
    super.destroy();
  }
}
