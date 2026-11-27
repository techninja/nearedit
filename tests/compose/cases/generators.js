/**
 * Reference documents: every generator.
 * @module tests/compose/cases/generators
 */

import { doc, gen } from '../build.js';

/** A backdrop that makes transparency and blending visible. */
export const sky = () =>
  gen('sky', 'gradient', { angle: 160, stops: 3, color2: '#0e7490', color3: '#f0abfc' });

const shape = (/** @type {string} */ id, /** @type {object} */ params) => [
  gen(id, 'shape', params),
];
const pattern = (/** @type {object} */ params) => doc([[gen('a', 'pattern', params)]]);

/**
 * @returns {Record<string, any>} Documents by case name
 */
export function generatorDocs() {
  const outline = { stroke: '#0f172a', strokeWidth: 14 };
  return {
    // The solid is half transparent, so the document background shows through.
    solid: doc(
      [
        shape('a', { shape: 'ellipse', fill: '#f97316' }),
        [gen('b', 'solid', { color: '#e2e8f0' }, { transform: { opacity: 0.5 } })],
      ],
      { background: '#14532d' },
    ),
    'gradient-linear': doc([[sky()]]),
    'gradient-radial': doc([
      [
        gen('a', 'gradient', {
          kind: 'radial',
          stops: 4,
          center: { x: 0.3, y: 0.6 },
          size: 0.8,
          position2: 0.2,
          position3: 0.5,
        }),
      ],
    ]),
    shapes: doc([
      shape('a', { radius: 60, width: 0.3, height: 0.3, position: { x: 0.2, y: 0.3 }, ...outline }),
      shape('b', {
        shape: 'polygon',
        sizing: 'pixels',
        widthPx: 380,
        heightPx: 380,
        position: { x: 0.5, y: 0.3 },
        fill: '#22c55e',
        rotation: 15,
      }),
      shape('c', {
        shape: 'star',
        points: 7,
        inner: 0.45,
        width: 0.25,
        height: 0.42,
        position: { x: 0.8, y: 0.3 },
        fill: '#fde047',
        stroke: '#7c2d12',
        strokeWidth: 10,
      }),
      shape('d', {
        shape: 'ellipse',
        filled: false,
        stroke: '#ffffff',
        strokeWidth: 20,
        width: 0.3,
        height: 0.25,
        position: { x: 0.25, y: 0.75 },
      }),
      shape('e', {
        shape: 'line',
        width: 0.4,
        thickness: 26,
        rotation: -12,
        fill: '#f43f5e',
        position: { x: 0.7, y: 0.75 },
      }),
      [sky()],
    ]),
    'pattern-stripes': pattern({ angle: 30, size: 90, fill: 0.35, speedX: 40 }),
    'pattern-checker': pattern({ pattern: 'checker', angle: -12, size: 110, offsetX: 33 }),
    'pattern-dots': pattern({ pattern: 'dots', angle: 45, size: 70, fill: 0.6, color: '#fb7185' }),
    'pattern-grid': pattern({ pattern: 'grid', size: 150, fill: 0.06, speedY: 25 }),
    noise: doc([[gen('a', 'noise', { colors: 3, scale: 420, octaves: 5, driftX: 60 })]]),
  };
}
