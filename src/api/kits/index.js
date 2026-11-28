/**
 * Brand kits on the server — what other parts of the server call. The
 * director and everything else that needs a project's brand asks
 * `projectKit`; `effectiveKit` resolves a choice without a registered
 * project. The routes are `../kits.js`; the kit model itself is
 * `#utils/brand/index.js`. Contract: docs/app-spec/BRAND-API.md.
 * @module api/kits
 */

export { effectiveKit } from './effective.js';
export { getKit, listKits } from './library.js';
export { projectKit } from './project.js';
