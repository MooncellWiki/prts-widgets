import {
  Mesh,
  MeshGeometry,
  Shader,
  UniformGroup,
  compileHighShaderGlProgram,
  compileHighShaderGpuProgram,
  localUniformBit,
  localUniformBitGl,
  roundPixelsBit,
  roundPixelsBitGl,
  type Texture,
} from "pixi.js";

/**
 * Torappu/UI/DoubleDissolve in 2791 PC [uc]shaders.ab, specialized to
 * avg_interlude_common_wave_dissolve and the four white wave_active Images.
 * The two red-channel ramps use _Time.y. With amount=1 and white Image color,
 * the rounded term in the native threshold is zero and the threshold is
 * the material tint (0.7352941). PNGs use top-down V, including the noise.
 */
const waveGl = {
  name: "interlude-wave",
  fragment: {
    header: /* glsl */ `
      uniform sampler2D uWave;
      uniform sampler2D uNoise;
      uniform float uTime;

      float dissolve(vec2 uv) {
        float red = texture(uNoise, vec2(uv.x, 1.0 - uv.y)).r;
        return clamp((red - 0.7352941) / 0.02, 0.0, 1.0);
      }
    `,
    main: /* glsl */ `
      vec2 uv = vec2(vUV.x, 1.0 - vUV.y);
      float a = dissolve(uv * vec2(0.91, 0.5) + vec2(-0.9 * uTime, 0.0));
      float b = dissolve(uv * vec2(0.45, 1.66) + vec2(0.23 + 0.4 * uTime, 0.32));
      vec4 base = texture(uWave, vUV);
      float coverage = a * b;
      if (base.a * coverage * vColor.a < 0.001) discard;
      outColor = vec4(base.rgb * 0.7352941, base.a) * coverage;
    `,
  },
};

const waveGpu = {
  name: "interlude-wave",
  fragment: {
    header: /* wgsl */ `
      struct WaveUniforms { uTime: f32 }
      @group(2) @binding(0) var uWave: texture_2d<f32>;
      @group(2) @binding(1) var uWaveSampler: sampler;
      @group(2) @binding(2) var uNoise: texture_2d<f32>;
      @group(2) @binding(3) var uNoiseSampler: sampler;
      @group(2) @binding(4) var<uniform> waveUniforms: WaveUniforms;

      fn dissolve(uv: vec2<f32>) -> f32 {
        let red = textureSample(uNoise, uNoiseSampler, vec2(uv.x, 1.0 - uv.y)).r;
        return clamp((red - 0.7352941) / 0.02, 0.0, 1.0);
      }
    `,
    main: /* wgsl */ `
      let uv = vec2(vUV.x, 1.0 - vUV.y);
      let time = waveUniforms.uTime;
      let a = dissolve(uv * vec2(0.91, 0.5) + vec2(-0.9 * time, 0.0));
      let b = dissolve(uv * vec2(0.45, 1.66) + vec2(0.23 + 0.4 * time, 0.32));
      let base = textureSample(uWave, uWaveSampler, vUV);
      let coverage = a * b;
      if (base.a * coverage * vColor.a < 0.001) { discard; }
      outColor = vec4(base.rgb * 0.7352941, base.a) * coverage;
    `,
  },
};

let programs: Pick<Shader, "glProgram" | "gpuProgram"> | undefined;

export function buildActiveWave(
  wave: Texture,
  noise: Texture,
): Mesh<MeshGeometry, Shader> {
  programs ??= {
    glProgram: compileHighShaderGlProgram({
      bits: [localUniformBitGl, roundPixelsBitGl, waveGl],
      name: waveGl.name,
    }),
    gpuProgram: compileHighShaderGpuProgram({
      bits: [localUniformBit, roundPixelsBit, waveGpu],
      name: waveGpu.name,
    }),
  };
  const noiseStyle = noise.source.style;
  if (noiseStyle.addressModeU !== "repeat") {
    // interclude_wave_dissolve is linear, Repeat U, Clamp V.
    noiseStyle.addressModeU = "repeat";
    noiseStyle.update();
  }
  const waveUniforms = new UniformGroup({ uTime: { value: 0, type: "f32" } });
  const shader = new Shader({
    ...programs,
    resources: {
      uNoise: noise.source,
      uNoiseSampler: noiseStyle,
      uWave: wave.source,
      uWaveSampler: wave.source.style,
      waveUniforms,
    },
  });

  // Keep the four 80×42 prefab quads and mirror their vertices around the
  // bottom-right pivot. Each piece samples the same local UVs before blending.
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (const [x, sx, sy] of [
    [4.8, 1, 1],
    [-4.8, -1, 1],
    [4.8, 1, -1],
    [-4.8, -1, -1],
  ] as const) {
    const first = positions.length / 2;
    const edge = x - 80 * sx;
    const top = -42 * sy;
    positions.push(edge, top, x, top, x, 0, edge, 0);
    uvs.push(0, 0, 1, 0, 1, 1, 0, 1);
    indices.push(first, first + 1, first + 2, first, first + 2, first + 3);
  }
  const geometry = new MeshGeometry({
    positions: new Float32Array(positions),
    uvs: new Float32Array(uvs),
    indices: new Uint32Array(indices),
  });
  const mesh = new Mesh({ geometry, shader, texture: wave });
  mesh.onRender = () => {
    // Both U offsets repeat every 10 seconds. Keep the uniform precise in
    // long sessions and retain the same clock when speaking resumes.
    if (mesh.visible)
      waveUniforms.uniforms.uTime = (performance.now() % 10_000) / 1000;
  };
  mesh.once("destroyed", () => {
    shader.destroy();
    geometry.destroy();
  });
  return mesh;
}
