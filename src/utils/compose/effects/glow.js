/**
 * Glow — a blurred copy of the layer added back on top of it, so bright
 * areas bloom and the layer gains a soft halo that spills past its own
 * edges. An `apply` effect: it needs a second surface and two passes.
 * @module utils/compose/effects/glow
 */

import { drawFiltered } from '#utils/compose/filterPass.js';

/** @type {import('#utils/compose/catalog.js').EffectModule} */
export default {
  type: 'glow',
  label: 'Glow',
  category: 'light',
  description: 'Adds a soft bloom around bright areas and edges',
  params: {
    radius: {
      type: 'number',
      default: 20,
      min: 0,
      max: 200,
      unit: 'px',
      label: 'Radius',
      animatable: true,
    },
    intensity: {
      type: 'number',
      default: 0.8,
      min: 0,
      max: 4,
      step: 0.05,
      label: 'Intensity',
      animatable: true,
    },
  },
  apply(surface, params, _time, frame, env) {
    const radius = params.radius * frame.scale;
    if (!(radius > 0 && params.intensity > 0)) return;
    const halo = env.scratch(surface.width, surface.height);
    drawFiltered(halo.ctx, surface, `blur(${radius}px)`, radius * 3, env);
    const { ctx } = surface;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'lighter';
    for (let left = params.intensity; left > 0; left -= 1) {
      ctx.globalAlpha = Math.min(1, left);
      ctx.drawImage(halo.canvas, 0, 0);
    }
  },
};
