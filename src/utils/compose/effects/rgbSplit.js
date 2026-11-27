/**
 * RGB split — chromatic aberration: the red channel shifted one way, the
 * blue the other, by `distance` output pixels along `angle`. On footage it
 * is the colour fringing of a cheap lens; on a title, the red and cyan
 * ghosts of a glitch.
 *
 * Three channels cannot share one alpha through any canvas operation
 * without thickening every soft edge, so this is a pixel pass
 * (`lib/channels.js`): about 20 ms at 1920×1080, a quarter of that on a
 * 960-pixel preview.
 * @module utils/compose/effects/rgbSplit
 */

import { splitChannels } from './lib/channels.js';

/** @type {import('#utils/compose/catalog.js').EffectModule} */
export default {
  type: 'rgbSplit',
  label: 'RGB split',
  category: 'distort',
  description: 'Chromatic aberration: red and blue shifted apart',
  params: {
    distance: {
      type: 'number',
      default: 8,
      min: 0,
      max: 400,
      unit: 'px',
      label: 'Distance',
      animatable: true,
    },
    angle: {
      type: 'number',
      default: 0,
      min: -360,
      max: 360,
      unit: '°',
      label: 'Angle',
      animatable: true,
    },
  },
  apply(surface, params, _time, frame) {
    const distance = params.distance * frame.scale;
    if (!(distance > 0)) return;
    const turn = (params.angle * Math.PI) / 180;
    const { ctx, width, height } = surface;
    const source = ctx.getImageData(0, 0, width, height);
    const result = ctx.createImageData(width, height);
    const dx = Math.cos(turn) * distance;
    const dy = Math.sin(turn) * distance;
    splitChannels(result.data, source.data, width, height, dx, dy);
    ctx.putImageData(result, 0, 0);
  },
};
