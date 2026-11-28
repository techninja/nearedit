/**
 * Gradient — linear or radial, two to eight colour stops. Geometry is in
 * fractions of the frame, so it needs no scaling. A linear gradient follows
 * the CSS convention: 0° runs bottom to top, 90° left to right, and at size
 * 1 the first and last colours just reach the corners.
 * @module utils/compose/generators/gradient
 */

/** Stops a gradient may have. */
export const MAX_STOPS = 8;

const COLORS = [
  '#1e1b4b',
  '#7c3aed',
  '#f97316',
  '#fde047',
  '#22d3ee',
  '#10b981',
  '#ef4444',
  '#ffffff',
];

/** @type {import('#utils/compose/params.js').ParamSchema} */
const stopParams = {};
for (let i = 1; i <= MAX_STOPS; i++) {
  const when =
    i > 2 ? { stops: Array.from({ length: MAX_STOPS - i + 1 }, (_, k) => i + k) } : undefined;
  stopParams[`color${i}`] = {
    type: 'color',
    default: COLORS[i - 1],
    label: `Colour ${i}`,
    animatable: true,
    ...(when && { when }),
  };
  stopParams[`position${i}`] = {
    type: 'number',
    default: -1,
    min: -1,
    max: 1,
    step: 0.01,
    label: `Position ${i} (-1 = even)`,
    animatable: true,
    ...(when && { when }),
  };
}

/**
 * Where a stop sits along the gradient: its own position, or evenly spaced
 * when that is negative.
 * @param {Record<string, any>} params
 * @param {number} i - 1-based
 * @param {number} count
 * @returns {number} 0..1
 */
function stopAt(params, i, count) {
  const own = params[`position${i}`];
  return own >= 0 ? Math.min(1, own) : (i - 1) / (count - 1);
}

/** @type {import('#utils/compose/catalog.js').GeneratorModule} */
export default {
  type: 'gradient',
  label: 'Gradient',
  category: 'background',
  description: 'Linear or radial colour gradient with up to eight stops',
  // One fill over the frame: it can be drawn straight over a picture.
  direct: true,
  params: {
    kind: { type: 'select', default: 'linear', options: ['linear', 'radial'], label: 'Type' },
    angle: {
      type: 'number',
      default: 90,
      min: 0,
      max: 360,
      unit: '°',
      label: 'Angle',
      animatable: true,
      when: { kind: ['linear'] },
    },
    center: { type: 'point', default: { x: 0.5, y: 0.5 }, label: 'Centre', animatable: true },
    size: {
      type: 'number',
      default: 1,
      min: 0.05,
      max: 4,
      step: 0.01,
      label: 'Size',
      animatable: true,
    },
    stops: { type: 'number', default: 2, min: 2, max: MAX_STOPS, step: 1, label: 'Colours' },
    ...stopParams,
  },
  draw(ctx, params, _time, frame) {
    const { width, height } = frame;
    const cx = params.center.x * width;
    const cy = params.center.y * height;
    let gradient;
    if (params.kind === 'radial') {
      const reach = Math.hypot(Math.max(cx, width - cx), Math.max(cy, height - cy));
      gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(1, reach * params.size));
    } else {
      const angle = (params.angle * Math.PI) / 180;
      const dx = Math.sin(angle);
      const dy = -Math.cos(angle);
      const half = ((Math.abs(width * dx) + Math.abs(height * dy)) * params.size) / 2;
      gradient = ctx.createLinearGradient(
        cx - dx * half,
        cy - dy * half,
        cx + dx * half,
        cy + dy * half,
      );
    }
    const count = Math.round(params.stops);
    for (let i = 1; i <= count; i++) {
      gradient.addColorStop(stopAt(params, i, count), params[`color${i}`]);
    }
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
  },
};
