/**
 * From a Base16 scheme to a theme, by rule: which of the sixteen colours
 * becomes which role, and what is done so the result reads — a colour that
 * carries text is moved towards black or white until it does (its hue
 * stays), and clip colours are moved away from the ink of their labels.
 * Nothing is tuned by hand, so any of the community's schemes works.
 * Isomorphic and pure. Contract: docs/app-spec/THEMES.md § Base16.
 * @module utils/theme/base16Map
 */

import { luminance } from '#utils/brand/color.js';
import { mix, neutral, readable, worstContrast } from './color.js';
import { CONTRAST_RULES, MARK_CONTRAST, TEXT_CONTRAST } from './contrast.js';
import { completeRoles, roleOf } from './roles.js';
import { CLIP_ROLE_IDS } from './rolesTimeline.js';

/** @typedef {import('./base16.js').Base16Scheme} Base16Scheme */

/** Role → the index of the scheme colour it takes as it is. */
export const BASE16_ROLES = Object.freeze({
  ...{ bg: 0x0, surface: 0x1, text: 0x5, accent: 0xd },
  ...{ danger: 0x8, warning: 0xa, success: 0xb, info: 0xc },
  ...{ playhead: 0x8, selection: 0xa, snap: 0xc, marker: 0x9 },
  ...{ clipVideo: 0xd, clipAudio: 0xb, clipImage: 0x9, clipTitle: 0xe },
  ...{ clipGenerator: 0xf, clipWeb: 0xc, clipPlaceholder: 0x3 },
});

/** The roles that carry text or a line: each must read on its grounds. */
const INKS = ['text', 'accent', 'danger', 'warning', 'success', 'info', 'playhead'];

/**
 * Map a scheme onto the roles.
 * @param {Base16Scheme} scheme - From `parseBase16`
 * @returns {{ theme: Omit<import('./model.js').Theme, 'id'>, notes: string[] }} The
 *   theme, and what was moved from the scheme's own colour so it reads
 */
export function fromBase16(scheme) {
  const b = scheme.colors;
  const mode = scheme.variant || (luminance(b[0]) < luminance(b[5]) ? 'dark' : 'light');
  /** @type {Record<string, string>} */
  const roles = Object.fromEntries(Object.entries(BASE16_ROLES).map(([id, i]) => [id, b[i]]));
  Object.assign(roles, {
    border: mix(b[1], b[3], 0.5),
    stage: neutral(b[0]),
    clipMusic: mix(b[0xd], b[0xe], 0.5),
    // The scheme's yellow, calmed with its comment grey: elements cover long stretches.
    clipElement: mix(b[0xa], b[3], 0.45),
  });
  /** @type {string[]} */
  const notes = [];
  /** @type {(id: string, grounds: string[], least: number) => void} */
  const settle = (id, grounds, least) => {
    const moved = readable(roles[id], grounds, least);
    if (moved === roles[id]) return;
    notes.push(`${roleOf(id).label}: ${roles[id]} became ${moved} to read at ${least}:1`);
    roles[id] = moved;
  };
  const all = () => completeRoles(roles, mode);
  // The scheme's own strong fill and quiet text are used where text reads on them.
  if (worstContrast(b[5], [b[2]]) >= TEXT_CONTRAST) roles.surface3 = b[2];
  for (const ink of INKS) {
    for (const rule of CONTRAST_RULES.filter((entry) => entry.ink === ink)) {
      settle(ink, rule.grounds.map((ground) => all()[ground]), rule.least);
    }
  }
  const { bg, surface, surface2, ruler } = all();
  if (worstContrast(b[4], [bg, surface, surface2, ruler]) >= TEXT_CONTRAST) roles.muted = b[4];
  roles.clipText = all().clipText;
  for (const id of [...CLIP_ROLE_IDS, 'marker']) settle(id, [roles.clipText], TEXT_CONTRAST);
  settle('selection', [all().lane], MARK_CONTRAST);
  const by = scheme.author ? ` by ${scheme.author}` : '';
  return {
    theme: {
      name: scheme.name || 'Base16 scheme',
      description: `A Base16 scheme${by}`.slice(0, 200),
      scheme: mode,
      extends: '',
      roles,
    },
    notes,
  };
}
