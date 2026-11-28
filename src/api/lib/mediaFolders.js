/**
 * What the server needs to know about a project over and over — its extra
 * media folders and the brand kit it chose — read without re-parsing the
 * project file each time. Path checks run on every media request, and the
 * project file also holds whole EDLs, so it is only read again when it
 * changed on disk.
 * @module api/lib/mediaFolders
 */

import { statSync } from 'node:fs';
import { resolve } from 'node:path';
import { projectFilePath, readProjectAt } from './registry.js';

/**
 * The small facts of a project file.
 * @typedef {Object} ProjectFacts
 * @property {string[]} folders - Its `mediaFolders`, resolved
 * @property {string} kit - Its `kit`: the brand kit it chose, '' for none
 * @property {Record<string, string>} adaptationKits - Adaptation id → the
 *   kit that adaptation chose, '' when it goes with the project's
 */

/** @type {Map<string, { key: string, facts: ProjectFacts|null }>} project file → its facts */
const cache = new Map();

/** @param {unknown} value @returns {string} */
const text = (value) => (typeof value === 'string' ? value : '');

/**
 * @param {string} projectDir - Absolute path of a project folder
 * @returns {ProjectFacts|null} null when there is no project file, or it cannot be read
 */
export function projectFactsOf(projectDir) {
  const file = projectFilePath(projectDir);
  let key;
  try {
    const st = statSync(file);
    key = `${st.mtimeMs}:${st.size}:${st.ino}`;
  } catch {
    cache.delete(file);
    return null; // no project file (yet)
  }
  const hit = cache.get(file);
  if (hit?.key === key) return hit.facts;
  const project = readProjectAt(projectDir);
  /** @type {ProjectFacts|null} */
  let facts = null;
  if (project && typeof project === 'object' && !Array.isArray(project)) {
    const extra = Array.isArray(project.mediaFolders) ? project.mediaFolders : [];
    const adaptations = Array.isArray(project.adaptations) ? project.adaptations : [];
    facts = {
      folders: extra.filter((f) => typeof f === 'string' && f).map((f) => resolve(f)),
      kit: text(project.kit),
      adaptationKits: Object.fromEntries(
        adaptations
          .filter((a) => a && typeof a === 'object' && typeof a.id === 'string')
          .map((a) => [a.id, text(a.kit)]),
      ),
    };
  }
  cache.set(file, { key, facts });
  return facts;
}

/**
 * @param {string} projectDir - Absolute path of a project folder
 * @returns {string[]} Resolved absolute paths; empty when the project has none or cannot be read
 */
export function mediaFoldersOf(projectDir) {
  return projectFactsOf(projectDir)?.folders || [];
}
