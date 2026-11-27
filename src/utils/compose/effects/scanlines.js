/**
 * Scanlines — evenly spaced lines drawn across the layer, like a CRT or an
 * interlaced tape. One path of thin rectangles filled with `source-atop`,
 * so the lines only mark what the layer shows. `speed` rolls them along
 * their own normal as time passes.
 * @module utils/compose/effects/scanlines
 */

import { withAlpha } from '#utils/compose/color.js';

/** Cosine and sine of 0°, 90°, 180° and 270°, exactly. */
const QUARTER_TURNS = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
];

/** @type {import('#utils/compose/catalog.js').EffectModule} */
export default {
  type: 'scanlines',
  label: 'Scanlines',
  category: 'stylize',
  description: 'Evenly spaced dark lines, optionally rolling',
  params: {
    spacing: {
      type: 'number',
      default: 6,
      min: 2,
      max: 400,
      unit: 'px',
      label: 'Spacing',
      animatable: true,
    },
    thickness: {
      type: 'number',
      default: 0.5,
      min: 0,
      max: 1,
      step: 0.01,
      label: 'Thickness (of spacing)',
      animatable: true,
    },
    opacity: {
      type: 'number',
      default: 0.35,
      min: 0,
      max: 1,
      step: 0.01,
      label: 'Opacity',
      animatable: true,
    },
    color: { type: 'color', default: '#000000', label: 'Colour', animatable: true },
    angle: {
      type: 'number',
      default: 0,
      min: -180,
      max: 180,
      unit: '°',
      label: 'Angle',
      animatable: true,
    },
    speed: {
      type: 'number',
      default: 0,
      min: -2000,
      max: 2000,
      unit: 'px/s',
      label: 'Roll speed',
    },
  },
  apply(surface, params, time, frame) {
    const pitch = params.spacing * frame.scale;
    const thick = pitch * params.thickness;
    if (!(params.opacity > 0 && thick > 0 && pitch > 0)) return;
    const { ctx } = surface;
    const { width, height } = frame;
    // Lines are laid out around the frame's centre, far enough to cover it at any angle.
    const reach = Math.hypot(width, height) / 2;
    const roll = (((params.speed * frame.scale * time.t) % pitch) + pitch) % pitch;
    const first = -Math.ceil(reach / pitch) * pitch + roll;
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = withAlpha(params.color, params.opacity);
    const quarter = params.angle / 90;
    if (Number.isInteger(quarter)) {
      // Upright lines are plain rectangles, which a canvas covers exactly:
      // a small preview then shows what the render averages to.
      const [a, b] = QUARTER_TURNS[((quarter % 4) + 4) % 4];
      ctx.setTransform(a, b, -b, a, width / 2, height / 2);
      for (let y = first; y < reach; y += pitch) ctx.fillRect(-reach, y, reach * 2, thick);
      return;
    }
    ctx.setTransform(1, 0, 0, 1, width / 2, height / 2);
    ctx.rotate((params.angle * Math.PI) / 180);
    ctx.beginPath();
    for (let y = first; y < reach; y += pitch) ctx.rect(-reach, y, reach * 2, thick);
    ctx.fill();
  },
};
