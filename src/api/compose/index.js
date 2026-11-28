/**
 * The compositor on the server — public surface of the Node host. The
 * compositor itself is `#utils/compose/index.js` (shared with the browser);
 * this folder supplies what it needs here. Node only.
 * @module api/compose
 */

export { createCanvas } from '@napi-rs/canvas';
export { createEnv, createFrameSource, loadImages } from './env.js';
export { FONT_DIR, registerDocumentFonts, registerFonts } from './fonts.js';
export { renderFrame } from './renderFrame.js';
