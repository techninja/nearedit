/**
 * The roles of a theme — what its author writes: grounds, surfaces, text,
 * lines, the accent, the status colours, the timeline's own grounds, a
 * colour for each kind of clip. Four are required; every other one has a
 * rule that finds it from the rest, so a theme of four colours is a whole
 * theme. Each role is data (label, group, the CSS custom property it
 * becomes, its place in a Design Tokens file), so an editor can be
 * generated from the list. Isomorphic and pure.
 * Contract: docs/app-spec/THEMES.md § Roles.
 * @module utils/theme/roles
 */

import { cleanColor } from './color.js';
import { INTERFACE_ROLES, STATUS_ROLES } from './rolesInterface.js';
import { CLIP_ROLES, TIMELINE_ROLES } from './rolesTimeline.js';

/** @typedef {'light'|'dark'} Scheme */

/**
 * One role.
 * @typedef {Object} Role
 * @property {string} id - Its name in a theme's `roles`
 * @property {string} path - Its place in a Design Tokens file: `group.name`
 * @property {string} token - The CSS custom property it becomes
 * @property {string} label
 * @property {string} description - Where the interface uses it
 * @property {boolean} [required] - A theme, or one it extends, must give it
 * @property {string} [rule] - In words: how it is found when a theme leaves it out
 * @property {(get: (id: string) => string, scheme: Scheme) => string} from - That
 *   rule; for a required role, the stand-in that keeps a broken theme usable
 */

/** The groups of roles, in the order an editor shows them. */
export const ROLE_GROUPS = Object.freeze([
  { id: 'interface', label: 'Interface' },
  { id: 'status', label: 'Status' },
  { id: 'timeline', label: 'Timeline' },
  { id: 'clip', label: 'Clips' },
]);

/** Every role, grouped as `ROLE_GROUPS`. @type {ReadonlyArray<Role>} */
export const ROLES = Object.freeze([
  ...INTERFACE_ROLES,
  ...STATUS_ROLES,
  ...TIMELINE_ROLES,
  ...CLIP_ROLES,
]);

/** @type {Map<string, Role>} */
const BY_ID = new Map(ROLES.map((role) => [role.id, role]));
/** @type {Map<string, Role>} */
const BY_PATH = new Map(ROLES.map((role) => [role.path, role]));

/** The ids of the roles no theme can do without. */
export const REQUIRED_ROLES = ROLES.filter((role) => role.required).map((role) => role.id);

/**
 * @param {string} id
 * @returns {Role|undefined}
 */
export const roleOf = (id) => BY_ID.get(id);

/**
 * @param {string} path - `group.name`, as in a Design Tokens file
 * @returns {Role|undefined}
 */
export const roleAt = (path) => BY_PATH.get(path);

/**
 * @param {Role} role
 * @returns {string} The id of its group: `interface`, `status`, `timeline`, `clip`
 */
export const groupOf = (role) => role.path.split('.')[0];

/**
 * Every role of a theme: what it gives, and for what it leaves out, what
 * its rule finds from the others.
 * @param {Record<string, unknown>} given - Role id → colour; anything that
 *   is not a colour counts as left out
 * @param {Scheme} scheme
 * @returns {Record<string, string>} Role id → `#rrggbb`, every role present
 */
export function completeRoles(given, scheme) {
  /** @type {Record<string, string>} */
  const roles = {};
  /** @type {(id: string) => string} */
  const get = (id) => {
    if (!roles[id]) {
      roles[id] = '#000000'; // a rule that asked for itself would get black, not a loop
      roles[id] = cleanColor(given?.[id]) || BY_ID.get(id).from(get, scheme);
    }
    return roles[id];
  };
  return Object.fromEntries(ROLES.map((role) => [role.id, get(role.id)]));
}
