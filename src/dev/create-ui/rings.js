/**
 * Temporary harness: a generator that is not in the catalog, served as
 * `/utils/compose/generators/rings.js` by the Playwright test, with two
 * presets. Deleted before the work is done.
 * @module dev/create-ui/rings
 */

export default {
  type: 'rings',
  label: 'Rings',
  category: 'holograms',
  description: 'Concentric rings (harness)',
  presets: [
    { id: 'tight', name: 'Tight rings', params: { spacing: 30, color: '#22d3ee' } },
    { id: 'wide', name: 'Wide rings', params: { spacing: 300 }, blendMode: 'add' },
  ],
  params: {
    spacing: { type: 'number', default: 120, min: 4, max: 400, unit: 'px', animatable: true },
    color: { type: 'color', default: '#f97316', label: 'Ring colour', animatable: true },
    filled: { type: 'boolean', default: false, label: 'Fill the middle' },
    style: { type: 'select', default: 'solid', options: ['solid', 'dashed'] },
    dash: { type: 'number', default: 12, min: 1, max: 100, when: { style: ['dashed'] } },
    caption: { type: 'text', default: '', label: 'Caption' },
    sprite: { type: 'image', default: '', label: 'Picture' },
    centre: { type: 'point', default: { x: 0.5, y: 0.5 }, animatable: true },
  },
  draw(ctx, p, _time, frame) {
    const cx = p.centre.x * frame.width;
    const cy = p.centre.y * frame.height;
    ctx.strokeStyle = p.color;
    ctx.fillStyle = p.color;
    ctx.lineWidth = 6 * frame.scale;
    if (p.style === 'dashed') ctx.setLineDash([p.dash * frame.scale, p.dash * frame.scale]);
    const step = Math.max(2, p.spacing * frame.scale);
    for (let r = step; r < frame.width; r += step) {
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (p.filled) {
      ctx.beginPath();
      ctx.arc(cx, cy, step / 2, 0, Math.PI * 2);
      ctx.fill();
    }
  },
};
