/**
 * Mirror — one half of the layer reflected onto the other: left onto right
 * (`horizontal`), top onto bottom (`vertical`), or the top-left quarter
 * onto all four (`quad`). `reverse` keeps the other side instead. The
 * reflection is a pixel-for-pixel copy about the middle of the frame.
 * @module utils/compose/effects/mirror
 */

/** @type {import('#utils/compose/catalog.js').EffectModule} */
export default {
  type: 'mirror',
  label: 'Mirror',
  category: 'distort',
  description: 'Reflects one half of the layer onto the other',
  params: {
    mode: {
      type: 'select',
      default: 'horizontal',
      options: ['horizontal', 'vertical', 'quad'],
      label: 'Mirror',
    },
    reverse: { type: 'boolean', default: false, label: 'Keep the other side' },
  },
  apply(surface, params, _time, frame, env) {
    const { ctx } = surface;
    const { width, height } = frame;
    /**
     * Replace one half with the reflection of the other.
     * @param {boolean} across - True for left/right, false for top/bottom
     */
    const reflect = (across) => {
      const copy = env.scratch(width, height);
      copy.ctx.drawImage(surface.canvas, 0, 0);
      const far = !params.reverse;
      const x = across && far ? Math.floor(width / 2) : 0;
      const y = !across && far ? Math.floor(height / 2) : 0;
      const w = across ? Math.ceil(width / 2) : width;
      const h = across ? height : Math.ceil(height / 2);
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.beginPath();
      ctx.rect(x, y, w, h);
      ctx.clip();
      ctx.clearRect(x, y, w, h);
      if (across) ctx.setTransform(-1, 0, 0, 1, width, 0);
      else ctx.setTransform(1, 0, 0, -1, 0, height);
      ctx.drawImage(copy.canvas, 0, 0);
      ctx.restore();
    };
    if (params.mode !== 'vertical') reflect(true);
    if (params.mode !== 'horizontal') reflect(false);
  },
};
