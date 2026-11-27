/**
 * The shared frame compositor — public surface. One implementation of
 * generators, effects, text and blending, written against the Canvas 2D API
 * and run by the browser preview and the server render alike.
 * Everything exported here is isomorphic: it touches the outside world only
 * through the host `env` passed to `drawFrame`.
 * Contract: docs/app-spec/COMPOSITOR.md. How to extend: README.md.
 * @module utils/compose
 */

export { drawFrame } from './drawFrame.js';
export { requirements } from './requirements.js';
export { layerKind, layersAt } from './layers.js';
export { clipTime, frameInfo } from './frame.js';
export { pictureSize } from './host.js';
export { resolveParams } from './params.js';
export { compositeOperation } from './blend.js';
export {
  BLEND_MODES,
  EASINGS,
  EFFECTS,
  FONT_FAMILIES,
  GENERATORS,
  TEXT_ANIMATIONS,
  TEXT_UNITS,
  catalog,
  effectModule,
  generatorModule,
} from './catalog.js';
export { fontString, resolveFamily } from './fonts.js';
export { textStyle, TITLE_BOX_PADDING, TITLE_LINE_HEIGHT } from './text/style.js';
export { layoutText } from './text/layout.js';
