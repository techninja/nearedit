/**
 * The colour spaces of the Design Tokens colour module (2025.10 § 4.2),
 * each brought to sRGB: what a theme needs to measure contrast and what a
 * page needs to paint. The arithmetic is that of CSS Color 4. A colour
 * outside sRGB is clipped to it. Isomorphic and pure.
 * @module utils/theme/tokens/spaces
 */

/** @typedef {[number, number, number]} Triple */
/** @typedef {[Triple, Triple, Triple]} Matrix */

/** @type {(m: Matrix, v: Triple) => Triple} */
const apply = (m, [a, b, c]) =>
  /** @type {Triple} */ (m.map((row) => row[0] * a + row[1] * b + row[2] * c));

/** @type {Matrix} */
const XYZ_TO_SRGB = [
  [3.2409699419045226, -1.537383177570094, -0.4986107602930034],
  [-0.9692436362808796, 1.8759675015077202, 0.04155505740717559],
  [0.05563007969699366, -0.20397695888897652, 1.0569715142428786],
];
/** @type {Matrix} */
const P3_TO_XYZ = [
  [0.4865709486482162, 0.26566769316909306, 0.1982172852343625],
  [0.2289745640697488, 0.6917385218365064, 0.079286914093745],
  [0, 0.04511338185890264, 1.043944368900976],
];
/** @type {Matrix} */
const A98_TO_XYZ = [
  [0.5766690429101305, 0.1855582379065463, 0.1882286462349947],
  [0.29734497525053605, 0.6273635662554661, 0.0752914584939978],
  [0.02703136138641234, 0.07068885253582723, 0.9913375368376388],
];
/** @type {Matrix} */
const PROPHOTO_TO_XYZ_D50 = [
  [0.7977604896723027, 0.13518583717574031, 0.0313493495815248],
  [0.2880711282292934, 0.7118432178101014, 0.00008565396060525902],
  [0, 0, 0.8251046025104601],
];
/** @type {Matrix} */
const REC2020_TO_XYZ = [
  [0.6369580483012914, 0.14461690358620832, 0.1688809751641721],
  [0.2627002120112671, 0.6779980715188708, 0.05930171646986196],
  [0, 0.028072693049087428, 1.060985057710791],
];
/** @type {Matrix} Bradford adaptation */
const D50_TO_D65 = [
  [0.9554734527042182, -0.023098536874261423, 0.0632593086610217],
  [-0.028369706963208136, 1.0099954580058226, 0.021041398966943008],
  [0.012314001688319899, -0.020507696433477912, 1.3303659366080753],
];
const D50_WHITE = [0.3457 / 0.3585, 1, (1 - 0.3457 - 0.3585) / 0.3585];

/** @type {(v: number) => number} sRGB's transfer curve, encoded → linear */
const linear = (v) => {
  const a = Math.abs(v);
  return a <= 0.04045 ? v / 12.92 : Math.sign(v) * ((a + 0.055) / 1.055) ** 2.4;
};
/** @type {(v: number) => number} linear → encoded */
const encoded = (v) => {
  const a = Math.abs(v);
  return a <= 0.0031308 ? v * 12.92 : Math.sign(v) * (1.055 * a ** (1 / 2.4) - 0.055);
};
/** @type {(xyz: Triple) => Triple} XYZ (D65) → sRGB, encoded */
const fromXyz = (xyz) => /** @type {Triple} */ (apply(XYZ_TO_SRGB, xyz).map(encoded));
/** @type {(curve: (v: number) => number, m: Matrix) => (c: Triple) => Triple} */
const rgbSpace = (curve, m) => (c) => fromXyz(apply(m, /** @type {Triple} */ (c.map(curve))));

/** @type {(c: Triple) => Triple} HSL → sRGB; hue in degrees, the others 0..100 */
function fromHsl([h, s, l]) {
  const [sat, light] = [s / 100, l / 100];
  const k = (/** @type {number} */ n) => (n + (((h % 360) + 360) % 360) / 30) % 12;
  const a = sat * Math.min(light, 1 - light);
  const f = (/** @type {number} */ n) =>
    light - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return [f(0), f(8), f(4)];
}

/** @type {(c: Triple) => Triple} HWB → sRGB; whiteness and blackness 0..100 */
function fromHwb([h, w, b]) {
  const [white, black] = [w / 100, b / 100];
  if (white + black >= 1) return [0, 1, 2].map(() => white / (white + black));
  return fromHsl([h, 100, 50]).map((v) => v * (1 - white - black) + white);
}

/** @type {(c: Triple) => Triple} CIE Lab (D50) → sRGB */
function fromLab([l, a, b]) {
  const [kappa, epsilon] = [24389 / 27, 216 / 24389];
  const f1 = (l + 16) / 116;
  const [f0, f2] = [a / 500 + f1, f1 - b / 200];
  const cube = (/** @type {number} */ f) => (f ** 3 > epsilon ? f ** 3 : (116 * f - 16) / kappa);
  const y = l > kappa * epsilon ? f1 ** 3 : l / kappa;
  const xyz = [cube(f0), y, cube(f2)].map((v, i) => v * D50_WHITE[i]);
  return fromXyz(apply(D50_TO_D65, /** @type {Triple} */ (xyz)));
}

/** @type {(c: Triple) => Triple} OKLab → sRGB */
function fromOklab([l, a, b]) {
  const lms = [
    l + 0.3963377774 * a + 0.2158037573 * b,
    l - 0.1055613458 * a - 0.0638541728 * b,
    l - 0.0894841775 * a - 1.291485548 * b,
  ].map((v) => v ** 3);
  const m = /** @type {Matrix} */ ([
    [4.0767416621, -3.3077115913, 0.2309699292],
    [-1.2684380046, 2.6097574011, -0.3413193965],
    [-0.0041960863, -0.7034186147, 1.707614701],
  ]);
  return /** @type {Triple} */ (apply(m, /** @type {Triple} */ (lms)).map(encoded));
}

/** @type {(c: Triple) => Triple} A lightness, a chroma and a hue as a lightness and two axes */
const polar = ([l, c, h]) => [l, c * Math.cos((h * Math.PI) / 180), c * Math.sin((h * Math.PI) / 180)];

/** @type {(v: number) => number} */
const rec2020 = (v) => {
  const [alpha, beta] = [1.09929682680944, 0.018053968510807];
  const a = Math.abs(v);
  return a < beta * 4.5 ? v / 4.5 : Math.sign(v) * ((a + alpha - 1) / alpha) ** (1 / 0.45);
};
/** @type {(v: number) => number} */
const prophoto = (v) => (Math.abs(v) <= 16 / 512 ? v / 16 : Math.sign(v) * Math.abs(v) ** 1.8);

/**
 * Every colour space of the format: `colorSpace` → its components as sRGB
 * (0..1 inside the sRGB gamut).
 * @type {Readonly<Record<string, (components: Triple) => Triple>>}
 */
export const TO_SRGB = Object.freeze({
  srgb: (c) => c,
  'srgb-linear': (c) => /** @type {Triple} */ (c.map(encoded)),
  hsl: fromHsl,
  hwb: fromHwb,
  lab: fromLab,
  lch: (c) => fromLab(polar(c)),
  oklab: fromOklab,
  oklch: (c) => fromOklab(polar(c)),
  'display-p3': rgbSpace(linear, P3_TO_XYZ),
  'a98-rgb': rgbSpace((v) => Math.sign(v) * Math.abs(v) ** (563 / 256), A98_TO_XYZ),
  'prophoto-rgb': (c) =>
    fromXyz(apply(D50_TO_D65, apply(PROPHOTO_TO_XYZ_D50, /** @type {Triple} */ (c.map(prophoto))))),
  rec2020: rgbSpace(rec2020, REC2020_TO_XYZ),
  'xyz-d65': fromXyz,
  'xyz-d50': (c) => fromXyz(apply(D50_TO_D65, c)),
});
