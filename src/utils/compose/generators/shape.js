/**
 * Shape — a rectangle (optionally rounded), ellipse, regular polygon, star
 * or line, filled and / or stroked. Its centre is a point in fractions of
 * the frame plus an offset in output pixels; its size is either a fraction
 * of the frame or output pixels (`sizing`). Everything outside the shape
 * stays transparent.
 * @module utils/compose/generators/shape
 */

import { shapePath } from './shapePath.js';

/** @type {{ type: 'number', unit: string, animatable: boolean }} A length in output pixels */
const px = { type: 'number', unit: 'px', animatable: true };
const frameOnly = { sizing: ['frame'] };
const pixelsOnly = { sizing: ['pixels'] };
const outlined = { shape: ['rectangle', 'ellipse', 'polygon', 'star'] };

/** @type {import('../catalog.js').GeneratorModule} */
export default {
  type: 'shape',
  label: 'Shape',
  category: 'shape',
  description: 'Rectangle, ellipse, polygon, star or line with fill and stroke',
  params: {
    shape: {
      type: 'select',
      default: 'rectangle',
      options: ['rectangle', 'ellipse', 'polygon', 'star', 'line'],
      label: 'Shape',
    },
    position: { type: 'point', default: { x: 0.5, y: 0.5 }, label: 'Centre', animatable: true },
    offsetX: { ...px, default: 0, min: -8000, max: 8000, label: 'Offset X' },
    offsetY: { ...px, default: 0, min: -8000, max: 8000, label: 'Offset Y' },
    sizing: { type: 'select', default: 'frame', options: ['frame', 'pixels'], label: 'Size in' },
    width: {
      type: 'number',
      default: 0.5,
      min: 0,
      max: 4,
      step: 0.005,
      label: 'Width (of frame)',
      animatable: true,
      when: frameOnly,
    },
    height: {
      type: 'number',
      default: 0.5,
      min: 0,
      max: 4,
      step: 0.005,
      label: 'Height (of frame)',
      animatable: true,
      when: frameOnly,
    },
    widthPx: { ...px, default: 400, min: 0, max: 16000, label: 'Width', when: pixelsOnly },
    heightPx: { ...px, default: 400, min: 0, max: 16000, label: 'Height', when: pixelsOnly },
    rotation: { type: 'number', default: 0, min: -3600, max: 3600, unit: '°', animatable: true },
    filled: { type: 'boolean', default: true, label: 'Fill', when: outlined },
    fill: { type: 'color', default: '#ffffff', label: 'Fill colour', animatable: true },
    stroke: { type: 'color', default: '#000000', label: 'Stroke colour', animatable: true },
    strokeWidth: { ...px, default: 0, min: 0, max: 400, label: 'Stroke width', when: outlined },
    radius: {
      ...px,
      default: 0,
      min: 0,
      max: 4000,
      label: 'Corner radius',
      when: { shape: ['rectangle'] },
    },
    sides: { type: 'number', default: 6, min: 3, max: 24, step: 1, when: { shape: ['polygon'] } },
    points: { type: 'number', default: 5, min: 3, max: 24, step: 1, when: { shape: ['star'] } },
    inner: {
      type: 'number',
      default: 0.5,
      min: 0.05,
      max: 1,
      step: 0.01,
      label: 'Inner radius',
      animatable: true,
      when: { shape: ['star'] },
    },
    thickness: {
      ...px,
      default: 8,
      min: 0,
      max: 400,
      label: 'Thickness',
      when: { shape: ['line'] },
    },
    cap: {
      type: 'select',
      default: 'round',
      options: ['round', 'butt', 'square'],
      label: 'Line ends',
      when: { shape: ['line'] },
    },
  },
  draw(ctx, p, _time, frame) {
    const inPixels = p.sizing === 'pixels';
    const w = inPixels ? p.widthPx * frame.scale : p.width * frame.width;
    const h = inPixels ? p.heightPx * frame.scale : p.height * frame.height;
    ctx.translate(
      p.position.x * frame.width + p.offsetX * frame.scale,
      p.position.y * frame.height + p.offsetY * frame.scale,
    );
    ctx.rotate((p.rotation * Math.PI) / 180);
    if (p.shape === 'line') {
      if (!(w > 0 && p.thickness > 0)) return;
      ctx.beginPath();
      ctx.moveTo(-w / 2, 0);
      ctx.lineTo(w / 2, 0);
      ctx.lineCap = p.cap;
      ctx.lineWidth = p.thickness * frame.scale;
      ctx.strokeStyle = p.fill;
      ctx.stroke();
      return;
    }
    if (!(w > 0 && h > 0)) return;
    shapePath(ctx, p.shape, w, h, /** @type {any} */ ({ ...p, radius: p.radius * frame.scale }));
    if (p.filled) {
      ctx.fillStyle = p.fill;
      ctx.fill();
    }
    if (p.strokeWidth > 0) {
      ctx.lineJoin = p.shape === 'rectangle' ? 'miter' : 'round';
      ctx.lineWidth = p.strokeWidth * frame.scale;
      ctx.strokeStyle = p.stroke;
      ctx.stroke();
    }
  },
};
