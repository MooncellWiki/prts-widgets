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
  Texture,
  textureBit,
  textureBitGl,
  UniformGroup,
} from "pixi.js";

const quad = new MeshGeometry({
  positions: new Float32Array([-0.5, -0.5, 0.5, -0.5, 0.5, 0.5, -0.5, 0.5]),
  uvs: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
  indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
});

/** A VideoCanvas draw with a binding that can release the media texture. */
export class VideoFrame extends Mesh<MeshGeometry, Shader> {
  private readonly textureUniforms = new UniformGroup({
    uTextureMatrix: { type: "mat3x3<f32>", value: new Matrix() },
  });

  constructor() {
    super({
      eventMode: "none",
      geometry: quad,
      texture: Texture.EMPTY,
      visible: false,
    });
  }

  setFrame(texture: Texture): void {
    if (texture === this.texture) return;

    // Pixi's sprite batch caches BindGroups across draws. A movie owns its
    // shader binding so it can detach its source before playback releases it.
    this.shader ??= new Shader({
      glProgram: compileHighShaderGlProgram({
        bits: [localUniformBitGl, textureBitGl, roundPixelsBitGl],
        name: "story-video-frame",
      }),
      gpuProgram: compileHighShaderGpuProgram({
        bits: [localUniformBit, textureBit, roundPixelsBit],
        name: "story-video-frame",
      }),
      resources: {
        textureUniforms: this.textureUniforms,
        uSampler: Texture.EMPTY.source.style,
        uTexture: Texture.EMPTY.source,
      },
    });
    this.texture = texture;
    this.textureUniforms.uniforms.uTextureMatrix =
      texture.textureMatrix.mapCoord;
    this.shader.resources.uTexture = texture.source;
    this.shader.resources.uSampler = texture.source.style;
  }

  override destroy(): void {
    this.shader?.destroy();
    super.destroy();
  }
}
