import type { ColorMatrix } from "pixi.js";

/**
 * Rec.601 luma weights, matching the `_Params.xyz` the native material writes
 * (`0.29899999, 0.58700001, 0.114` as float32). They sum to 1, so desaturating
 * with them preserves brightness.
 */
const LUMA_R = 0.299;
const LUMA_G = 0.587;
const LUMA_B = 0.114;

/**
 * Builds the 4x5 `ColorMatrixFilter` matrix that models Torappu's shared
 * post-effect material `AVG/[UC]Common/Arts/Materials/mat_grayscale` (shader
 * `Torappu/PostEffect/Grayscale`).
 *
 * Two native implementations blit through that one material, so both route
 * here: `AVGSceneGrayScale` (2.7.61 `_ApplyAmountsToMaterial` @ 0x183E86CF0,
 * driven by `cameraeffect`) and `AVGSceneFocusOut` (`Render` @ 0x183E859D0,
 * driven by `focusout`/`focusparam`). Both write
 * `_Params = (0.299, 0.587, 0.114, grayAmount)` and `_Inverse = inverseAmount`.
 *
 * Fragment math, verified against the GLES3 GLSL in the 2.7.51 Android
 * `[uc]shaders.ab` bundle:
 *
 * ```
 * A   = lerp(color, 1 - color, _Inverse)
 * out = lerp(A.rgb, dot(A.rgb, _Params.xyz), _Params.w)
 * ```
 *
 * The matrix below applies the two lerps in the opposite order — desaturate,
 * then invert — which is algebraically identical because the Rec.601 weights
 * sum to 1:
 *
 * ```
 * out = (1 - 2*inverse) * lerp(color, luma601(color), gray) + inverse
 * ```
 *
 * so the rgb rows are `lerp(I, luma601 row, gray)` scaled by `1 - 2*inverse`
 * with an `inverse` offset. `gray = 1` yields rows of exactly
 * `(0.299, 0.587, 0.114)`.
 *
 * pixi's `ColorMatrixFilter.grayscale()`/`negative()` helpers cannot express
 * this: `grayscale()` builds an *additive* `[s, s, s]` tint whose output is
 * `s * (R + G + B)`, which clips mid-grays to white near amount 1, and
 * sequential `multiply = false` calls overwrite each other instead of
 * composing.
 *
 * The alpha row stays identity on purpose. Native inverts alpha too, but its
 * blit replaces the whole render target (srcBlend 1 / destBlend 0) so that is
 * invisible; pixi feeds filter alpha into layer compositing, where inverting it
 * would be very visible. Deliberate divergence — do not "fix".
 *
 * @param gray Desaturation amount (`_Params.w`). 0 = identity, 1 = full luma.
 * @param inverse Inversion amount (`_Inverse`). 0 = identity, 1 = full negative.
 */
export function buildColorEffectMatrix(
  gray: number,
  inverse: number,
): ColorMatrix {
  const scale = 1 - 2 * inverse;
  const lumR = LUMA_R * gray;
  const lumG = LUMA_G * gray;
  const lumB = LUMA_B * gray;
  const diag = 1 - gray;
  return [
    (lumR + diag) * scale,
    lumG * scale,
    lumB * scale,
    0,
    inverse,
    lumR * scale,
    (lumG + diag) * scale,
    lumB * scale,
    0,
    inverse,
    lumR * scale,
    lumG * scale,
    (lumB + diag) * scale,
    0,
    inverse,
    0,
    0,
    0,
    1,
    0,
  ];
}
