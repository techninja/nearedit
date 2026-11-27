/**
 * Wipe — a soft-edged reveal of the layer by `progress`: 0 shows nothing,
 * 1 everything. Keyframe `progress` and the layer wipes on; put it on the
 * incoming clip of two overlapping ones and it is a transition. Shapes: a
 * straight edge (`linear`), a growing circle (`radial`), an opening box or
 * diamond (`iris`), a clock hand (`clock`). `invert` reveals the opposite
 * part instead, which makes the same progress wipe the layer off.
 *
 * The mask is a gradient (`lib/wipeShapes.js`) multiplied into the layer's
 * alpha, so it costs one or two fills whatever the feather.
 * @module utils/compose/effects/wipe
 */

import { WIPE_SHAPES } from './lib/wipeShapes.js';

const centred = { shape: ['radial', 'iris', 'clock'] };

/** @type {import('#utils/compose/catalog.js').EffectModule} */
export default {
  type: 'wipe',
  label: 'Wipe',
  category: 'key',
  description: 'Soft-edged reveal by progress: linear, radial, iris or clock',
  params: {
    progress: {
      type: 'number',
      default: 0.5,
      min: 0,
      max: 1,
      step: 0.001,
      label: 'Progress',
      animatable: true,
    },
    shape: {
      type: 'select',
      default: 'linear',
      options: ['linear', 'radial', 'iris', 'clock'],
      label: 'Shape',
    },
    angle: {
      type: 'number',
      default: 0,
      min: -360,
      max: 360,
      unit: '°',
      label: 'Angle',
      animatable: true,
      when: { shape: ['linear', 'iris', 'clock'] },
    },
    feather: {
      type: 'number',
      default: 40,
      min: 0,
      max: 2000,
      unit: 'px',
      label: 'Feather',
      animatable: true,
    },
    center: {
      type: 'point',
      default: { x: 0.5, y: 0.5 },
      label: 'Centre',
      animatable: true,
      when: centred,
    },
    invert: { type: 'boolean', default: false, label: 'Invert' },
  },
  apply(surface, params, _time, frame, env) {
    const { ctx } = surface;
    const { width, height } = frame;
    // Exact at the ends: nothing at 0, everything at 1 (the reverse when inverted).
    const shown = params.invert ? 1 - params.progress : params.progress;
    if (shown >= 1) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (shown <= 0) return ctx.clearRect(0, 0, width, height);
    const fills = WIPE_SHAPES[params.shape](ctx, {
      progress: params.progress,
      angle: params.angle,
      feather: Math.max(1, params.feather * frame.scale),
      x: params.center.x * width,
      y: params.center.y * height,
      width,
      height,
    });
    /** @type {(target: any, operation: string) => void} */
    const multiply = (target, operation) => {
      target.globalCompositeOperation = operation;
      for (const fill of fills) {
        target.fillStyle = fill;
        target.fillRect(0, 0, width, height);
      }
    };
    if (!params.invert) return multiply(ctx, 'destination-in');
    if (fills.length === 1) return multiply(ctx, 'destination-out');
    // One minus a product of masks: multiply them on their own surface first.
    const mask = env.scratch(width, height);
    mask.ctx.fillRect(0, 0, width, height);
    multiply(mask.ctx, 'destination-in');
    ctx.globalCompositeOperation = 'destination-out';
    ctx.drawImage(mask.canvas, 0, 0);
  },
};
