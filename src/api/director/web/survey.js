/**
 * Looking at the page: snapshots taken through the recorder — the page as
 * it loads, and again after the first steps of the demo when one of them
 * may have changed what is there (a click that opens something, a new
 * page). Every look starts a browser, so there are only a few.
 * Reference: docs/app-spec/DIRECTOR-WEB.md § Matching names.
 * @module api/director/web/survey
 */

import { getConfig } from '../../lib/config.js';
import { takeSnapshot } from '../../web/snapshot.js';
import { asDirectorError } from './check.js';

/** Looks a demo may take in all: the first, and three more. */
export const MAX_LOOKS = 4;

/**
 * @typedef {import('#utils/director/web/match.js').PageElement} PageElement
 * @typedef {Object} Seen - A snapshot (WEBCLIP.md § Server)
 * @property {string} url
 * @property {string} title
 * @property {{ width: number, height: number }} viewport
 * @property {{ width: number, height: number }} page
 * @property {string} image - PNG data URL of the viewport
 * @property {PageElement[]} elements
 * @property {string[]} warnings
 * @typedef {Object} Survey
 * @property {(steps?: object[]) => Promise<Seen>} look - The page after these steps
 * @property {() => boolean} spent - No look is left
 * @property {() => number} count - Looks taken
 */

/**
 * @param {Object} options
 * @param {object} options.base - The recipe without its steps
 * @param {string} options.browser - Path of the browser
 * @param {AbortSignal} [options.signal]
 * @param {typeof takeSnapshot} [options.snapshot] - Tests pass their own
 * @returns {Survey}
 */
export function createSurvey({ base, browser, signal, snapshot = takeSnapshot }) {
  let looks = 0;
  return {
    spent: () => looks >= MAX_LOOKS,
    count: () => looks,
    async look(steps = []) {
      looks++;
      const { allow, noSandbox } = getConfig().web;
      // A step that finds nothing must not end the look: the next names still need the page.
      const recipe = { ...base, onMissing: 'skip', steps };
      try {
        return await snapshot({ recipe, browser, allow, noSandbox, signal });
      } catch (err) {
        throw asDirectorError(err);
      }
    },
  };
}
