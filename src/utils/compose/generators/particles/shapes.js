/**
 * The built-in particle sprites, as drawings in white on transparent. Each
 * is drawn around the origin in units of its own longer side (so it fits
 * the box `w × h`, both at most 1) with its top pointing up; the sprite
 * cache scales that to whatever pixel size is needed and tints it.
 * Pure geometry on a context.
 * @module utils/compose/generators/particles/shapes
 */

import { polygonPath } from '#utils/compose/generators/shapePath.js';

/**
 * @typedef {Object} Shape
 * @property {number} w - Width as a share of the longer side
 * @property {number} h - Height as a share of the longer side
 * @property {boolean} round - Looks the same at every rotation
 * @property {boolean} [flush] - Its outline lies along its box
 * @property {(ctx: any) => void} paint
 */

const TURN = Math.PI * 2;
/** Opacity of the soft dot at distances 0, 0.2 … 1 of its radius: (1 − r²)². */
const SOFT = [1, 0.9216, 0.7056, 0.4096, 0.1296, 0];
/** The spark is hotter in the middle and fades sooner. */
const HOT = [1, 0.9, 0.6, 0.28, 0.08, 0];

/**
 * Fill the unit box with a radial fall-off.
 * @param {any} ctx
 * @param {number[]} levels - Opacity at evenly spaced distances, centre first
 */
function glow(ctx, levels) {
  const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, 0.5);
  levels.forEach((alpha, i) => {
    gradient.addColorStop(i / (levels.length - 1), `rgba(255, 255, 255, ${alpha})`);
  });
  ctx.fillStyle = gradient;
  ctx.fillRect(-0.5, -0.5, 1, 1);
}

/**
 * Fill the path a function traces.
 * @param {any} ctx
 * @param {(ctx: any) => void} trace
 */
function fill(ctx, trace) {
  ctx.beginPath();
  trace(ctx);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
}

/**
 * Stroke the path a function traces.
 * @param {any} ctx
 * @param {number} width - Line width
 * @param {(ctx: any) => void} trace
 */
function stroke(ctx, width, trace) {
  ctx.beginPath();
  trace(ctx);
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();
}

/**
 * Six arms, each with a pair of side branches.
 * @param {any} ctx
 */
function flake(ctx) {
  for (let arm = 0; arm < 6; arm++) {
    const angle = (arm * TURN) / 6;
    const [x, y] = [Math.sin(angle), -Math.cos(angle)];
    ctx.moveTo(0, 0);
    ctx.lineTo(x * 0.46, y * 0.46);
    for (const side of [-1, 1]) {
      const twig = angle + side * 0.9;
      ctx.moveTo(x * 0.27, y * 0.27);
      ctx.lineTo(x * 0.27 + Math.sin(twig) * 0.15, y * 0.27 - Math.cos(twig) * 0.15);
    }
  }
}

/**
 * A heart, tip down.
 * @param {any} ctx
 */
function heart(ctx) {
  ctx.moveTo(0, 0.45);
  ctx.bezierCurveTo(-0.82, 0.05, -0.49, -0.86, 0, -0.22);
  ctx.bezierCurveTo(0.49, -0.86, 0.82, 0.05, 0, 0.45);
  ctx.closePath();
}

/** @type {Record<string, Shape>} */
export const SHAPES = {
  dot: { w: 1, h: 1, round: true, paint: (ctx) => glow(ctx, SOFT) },
  circle: { w: 1, h: 1, round: true, paint: (ctx) => fill(ctx, (c) => c.arc(0, 0, 0.5, 0, TURN)) },
  square: {
    w: 1,
    h: 1,
    round: false,
    flush: true,
    paint: (ctx) => fill(ctx, (c) => c.rect(-0.5, -0.5, 1, 1)),
  },
  star: {
    w: 1,
    h: 1,
    round: false,
    paint: (ctx) => fill(ctx, (c) => polygonPath(c, 0.5, 0.5, 5, 0.42)),
  },
  spark: {
    w: 0.3,
    h: 1,
    round: false,
    paint(ctx) {
      ctx.scale(0.3, 1);
      glow(ctx, HOT);
    },
  },
  ring: {
    w: 1,
    h: 1,
    round: true,
    paint: (ctx) => stroke(ctx, 0.12, (c) => c.arc(0, 0, 0.44, 0, TURN)),
  },
  snowflake: { w: 1, h: 1, round: false, paint: (ctx) => stroke(ctx, 0.085, flake) },
  heart: { w: 1, h: 0.9, round: false, paint: (ctx) => fill(ctx, heart) },
  confetti: {
    w: 1,
    h: 0.6,
    round: false,
    flush: true,
    paint: (ctx) => fill(ctx, (c) => c.rect(-0.5, -0.3, 1, 0.6)),
  },
};

/** Names of the built-in sprites, in menu order. */
export const SPRITES = Object.keys(SHAPES);
