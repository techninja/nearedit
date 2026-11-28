/**
 * The roles of the interface itself: grounds, surfaces, text, lines, the
 * accent and focus, and the surround of the picture. Part of `ROLES`
 * (`roles.js`). Isomorphic and pure.
 * @module utils/theme/rolesInterface
 */

import { readableOn } from '#utils/brand/color.js';
import { mix, readable } from './color.js';

/** @typedef {import('./roles.js').Role} Role */

/** @type {(light: string, dark: string) => Role['from']} */
const byScheme = (light, dark) => (_get, scheme) => (scheme === 'dark' ? dark : light);

/** @type {Role[]} */
export const INTERFACE_ROLES = [
  {
    ...{ id: 'bg', path: 'interface.bg', token: '--color-bg', label: 'Ground' },
    description: 'The page, wells and the fields one types in',
    required: true,
    from: byScheme('#f4f4f4', '#161616'),
  },
  {
    ...{ id: 'surface', path: 'interface.surface', token: '--color-surface', label: 'Surface' },
    description: 'Panels, bars, cards, dialogs and menus',
    required: true,
    from: byScheme('#ffffff', '#212121'),
  },
  {
    ...{ id: 'surface2', path: 'interface.surface2', token: '--color-surface-2' },
    label: 'Quiet fill',
    description: 'Hovered rows and buttons, chips, keycaps, the headers of audio tracks',
    rule: 'Half way from the surface to the ground',
    from: (get) => mix(get('surface'), get('bg'), 0.5),
  },
  {
    ...{ id: 'surface3', path: 'interface.surface3', token: '--color-surface-3' },
    label: 'Strong fill',
    description: 'Pressed and chosen controls, the track of a progress bar',
    rule: 'The surface with a tenth of the text colour',
    from: (get) => mix(get('surface'), get('text'), 0.1),
  },
  {
    ...{ id: 'border', path: 'interface.border', token: '--color-border', label: 'Lines' },
    description: 'Borders of fields and panels, separators',
    rule: 'The surface with a sixth of the text colour',
    from: (get) => mix(get('surface'), get('text'), 0.16),
  },
  {
    ...{ id: 'text', path: 'interface.text', token: '--color-text', label: 'Text' },
    description: 'What is read: labels, values, titles',
    required: true,
    from: byScheme('#1a1a1a', '#e8e8e8'),
  },
  {
    ...{ id: 'muted', path: 'interface.muted', token: '--color-text-muted', label: 'Quiet text' },
    description: 'Field names, hints, icons at rest, the numbers of the ruler',
    rule: 'The text a third of the way to the ground, moved until it reads on the ground, the surface and the quiet fill',
    from: (get) =>
      readable(mix(get('text'), get('bg'), 0.35), [get('bg'), get('surface'), get('surface2')], 4.5),
  },
  {
    ...{ id: 'accent', path: 'interface.accent', token: '--color-primary', label: 'Accent' },
    description: 'The main button, links, what is chosen, the play button, the loop',
    required: true,
    from: byScheme('#2563eb', '#3b82f6'),
  },
  {
    ...{ id: 'onAccent', path: 'interface.onAccent', token: '--color-text-inverse' },
    label: 'Text on the accent',
    description: 'Letters on the accent and on a red or amber button',
    rule: 'Black or white, whichever reads better on the accent',
    from: (get) => readableOn(get('accent')),
  },
  {
    ...{ id: 'focus', path: 'interface.focus', token: '--color-focus', label: 'Focus' },
    description: 'The ring around what the keyboard is on',
    rule: 'The accent, moved until it stands out from the ground and the surface (3:1)',
    from: (get) => readable(get('accent'), [get('bg'), get('surface')], 3),
  },
  {
    ...{ id: 'stage', path: 'interface.stage', token: '--color-stage', label: 'Picture surround' },
    description: 'What lies around the preview: a tinted surround changes how a picture is judged',
    rule: 'The ground',
    from: (get) => get('bg'),
  },
];

/** A red, an amber, a green and a blue for each scheme: [light, dark]. */
const STATUS = {
  danger: ['#dc2626', '#f87171', 'Errors, and the button that deletes'],
  warning: ['#b45309', '#fbbf24', 'What needs attention: out of date, cannot be done here'],
  success: ['#15803d', '#4ade80', 'What went well; regions on the timeline'],
  info: ['#0369a1', '#38bdf8', 'Notes, and a message that is neither good nor bad'],
};

/** @type {Role[]} */
export const STATUS_ROLES = Object.entries(STATUS).map(([id, [light, dark, description]]) => ({
  ...{ id, path: `status.${id}`, token: `--color-${id}` },
  label: id[0].toUpperCase() + id.slice(1),
  description,
  rule: 'A colour for the scheme, moved until it reads as text on the ground and the surface',
  from: (get, scheme) =>
    readable(scheme === 'dark' ? dark : light, [get('bg'), get('surface')], 4.5),
}));
