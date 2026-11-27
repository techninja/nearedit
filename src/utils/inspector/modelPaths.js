/**
 * Every fixed clip field the inspector shows, by path. Generator and
 * effect parameters are not listed: they come from the catalog schemas
 * (`paramControls.js`). Pure data.
 * @module utils/inspector/modelPaths
 */

/** @type {(prefix: string, keys: string[]) => string[]} */
const under = (prefix, keys) => keys.map((key) => `${prefix}.${key}`);

const ANIMATION = ['type', 'duration', 'by', 'stagger', 'ease'];

/** @type {string[]} */
export const PATHS = [
  ...['label', 'color', 'fadeIn', 'fadeOut', 'volume', 'prompt', 'intent'],
  ...['blendMode', 'fadeInCurve', 'fadeOutCurve'],
  ...under('transform', ['x', 'y', 'scaleX', 'scaleY', 'rotation', 'opacity', 'fit']),
  ...under('transform', ['cropTop', 'cropBottom', 'cropLeft', 'cropRight']),
  ...under('transform.kenBurns', ['enabled', 'startX', 'startY', 'startScale']),
  ...under('transform.kenBurns', ['endX', 'endY', 'endScale']),
  ...under('text', ['content', 'fontFamily', 'fontSize', 'weight', 'color', 'background']),
  ...under('text', ['align', 'bold', 'italic', 'outlineColor', 'outlineWidth']),
  ...under('text', ['lineHeight', 'letterSpacing', 'maxWidth', 'boxPadding', 'boxRadius']),
  ...under('text', ['shadowColor', 'shadowBlur', 'shadowX', 'shadowY']),
  ...under('text.animateIn', ANIMATION),
  ...under('text.animateOut', ANIMATION),
  ...under('generator', ['type', 'seed']),
];
