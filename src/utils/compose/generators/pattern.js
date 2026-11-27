/**
 * Pattern — stripes, a checkerboard, dots or a grid in two colours, at any
 * angle, with an offset that can be keyframed or left to drift at a speed.
 * Drawn as geometry (never as a repeated bitmap), so edges stay sharp at
 * every angle and size.
 * @module utils/compose/generators/pattern
 */

/** Smallest cell that is still drawn as a pattern, canvas pixels. */
const MIN_CELL = 3;

/**
 * Add parallel bands to the current path, covering ±reach around the origin.
 * @param {any} ctx
 * @param {number} period - Distance from one band to the next
 * @param {number} thickness
 * @param {number} shift - Position of band 0
 * @param {number} reach
 * @param {boolean} upright - Bands run vertically (spaced along x)
 */
function bands(ctx, period, thickness, shift, reach, upright) {
  for (let k = Math.floor((-reach - shift) / period); k * period + shift < reach; k++) {
    const at = k * period + shift;
    if (upright) ctx.rect(at, -reach, thickness, reach * 2);
    else ctx.rect(-reach, at, reach * 2, thickness);
  }
}

/**
 * Add a lattice of dots to the current path, skipping those outside the frame.
 * @param {any} ctx
 * @param {number} period
 * @param {number} radius
 * @param {{ x: number, y: number }} shift
 * @param {number} reach
 * @param {(x: number, y: number) => boolean} visible
 */
function dots(ctx, period, radius, shift, reach, visible) {
  for (let j = Math.floor((-reach - shift.y) / period); j * period + shift.y < reach; j++) {
    for (let i = Math.floor((-reach - shift.x) / period); i * period + shift.x < reach; i++) {
      const x = i * period + shift.x + period / 2;
      const y = j * period + shift.y + period / 2;
      if (!visible(x, y)) continue;
      ctx.moveTo(x + radius, y);
      ctx.arc(x, y, radius, 0, Math.PI * 2);
    }
  }
}

/** @type {{ type: 'number', unit: string, animatable: boolean }} A length in output pixels */
const px = { type: 'number', unit: 'px', animatable: true };
/** @type {import('../params.js').ParamSpec} */
const speed = { type: 'number', unit: 'px/s', default: 0, min: -4000, max: 4000, animatable: true };

/** @type {import('../catalog.js').GeneratorModule} */
export default {
  type: 'pattern',
  label: 'Pattern',
  category: 'pattern',
  description: 'Stripes, checkerboard, dots or grid in two colours',
  params: {
    pattern: {
      type: 'select',
      default: 'stripes',
      options: ['stripes', 'checker', 'dots', 'grid'],
      label: 'Pattern',
    },
    color: { type: 'color', default: '#f8fafc', label: 'Colour', animatable: true },
    background: { type: 'color', default: '#0f172a', label: 'Background', animatable: true },
    size: { ...px, default: 80, min: 2, max: 4000, label: 'Cell size' },
    fill: {
      type: 'number',
      default: 0.5,
      min: 0,
      max: 1,
      step: 0.01,
      label: 'Coverage',
      animatable: true,
      when: { pattern: ['stripes', 'dots', 'grid'] },
    },
    angle: { type: 'number', default: 0, min: -3600, max: 3600, unit: '°', animatable: true },
    offsetX: { ...px, default: 0, min: -100000, max: 100000, label: 'Offset X' },
    offsetY: { ...px, default: 0, min: -100000, max: 100000, label: 'Offset Y' },
    speedX: { ...speed, label: 'Drift X' },
    speedY: { ...speed, label: 'Drift Y' },
  },
  draw(ctx, p, time, frame) {
    const { width, height, scale } = frame;
    ctx.fillStyle = p.background;
    ctx.fillRect(0, 0, width, height);
    const cell = Math.max(MIN_CELL, p.size * scale);
    const reach = Math.hypot(width, height) / 2 + cell;
    const shift = {
      x: (p.offsetX + p.speedX * time.t) * scale,
      y: (p.offsetY + p.speedY * time.t) * scale,
    };
    const angle = (p.angle * Math.PI) / 180;
    const [cos, sin] = [Math.cos(angle), Math.sin(angle)];
    ctx.translate(width / 2, height / 2);
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.fillStyle = p.color;
    if (p.pattern === 'checker') {
      bands(ctx, cell * 2, cell, shift.x, reach, true);
      bands(ctx, cell * 2, cell, shift.y, reach, false);
      ctx.fill('evenodd');
      return;
    }
    if (p.pattern === 'dots') {
      const radius = (cell * p.fill) / 2;
      const inFrame = (/** @type {number} */ x, /** @type {number} */ y) =>
        Math.abs(x * cos - y * sin) < width / 2 + radius &&
        Math.abs(x * sin + y * cos) < height / 2 + radius;
      if (radius > 0) dots(ctx, cell, radius, shift, reach, inFrame);
    } else {
      const thickness = cell * p.fill;
      const centred = p.pattern === 'grid' ? -thickness / 2 : 0;
      bands(ctx, cell, thickness, shift.x + centred, reach, true);
      if (p.pattern === 'grid') bands(ctx, cell, thickness, shift.y + centred, reach, false);
    }
    ctx.fill();
  },
};
