/**
 * Brand kits — a look set once and inherited everywhere: the kit model with
 * inheritance, the element language and its expansion into ordinary clips,
 * the built-in kits. Everything exported here is isomorphic and pure.
 * Contract: docs/app-spec/BRAND.md; the element language: `element/index.js`.
 * @module utils/brand
 */

export { BRAND_VERSION, BUILTIN_PREFIX, DEFAULT_KIT, ID_PATTERN, LIMITS, isId } from './limits.js';
export { FONT_FIELDS, TOKEN_SCHEMA, defaultTokens, tokenValue } from './tokens.js';
export {
  INKS,
  MIN_CONTRAST,
  contrastRatio,
  isReadable,
  luminance,
  readableOn,
  withOpacity,
} from './color.js';
export { normalizeKit } from './normalize.js';
export { KitError, kitChain, resolveKit } from './resolve.js';
export { KEY_LENGTH, KEY_PATTERN, canonicalKit, kitKey } from './key.js';
export { kitFiles, mapKitFiles } from './files.js';
export { FONT_FILE, cleanFonts, isCustomFamily, mergeFonts, sameFonts } from './fontTable.js';
export { BUILTIN_KITS, builtinKit } from './kits/index.js';
export { STANDARD_DEFAULTS, STANDARD_ELEMENTS } from './kits/parts.js';
export { elementSpan, isElementClip, sameElement } from './clip.js';
export { checkElement, cleanElement, cleanSlots } from './field.js';
export * from './element/index.js';
