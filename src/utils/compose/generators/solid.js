/**
 * Solid — one colour over the whole frame.
 * @module utils/compose/generators/solid
 */

/** @type {import('#utils/compose/catalog.js').GeneratorModule} */
export default {
  type: 'solid',
  label: 'Solid colour',
  category: 'background',
  description: 'One colour filling the frame',
  params: {
    color: { type: 'color', default: '#1e293b', label: 'Colour', animatable: true },
  },
  draw(ctx, params, _time, frame) {
    ctx.fillStyle = params.color;
    ctx.fillRect(0, 0, frame.width, frame.height);
  },
};
