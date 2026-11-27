/**
 * Command catalog — adding markers, titles and tracks.
 * @module utils/commands/catalogInsert
 */

import * as insert from './insert.js';

/** @typedef {import('./registry.js').Command} Command */

/** @type {Command[]} */
export const INSERT_COMMANDS = [
  {
    id: 'marker.add',
    label: 'Add marker at cursor',
    group: 'Insert',
    keys: ['M'],
    run: () => insert.addMarkerAtCursor(),
    icon: 'marker',
  },
  {
    id: 'title.add',
    label: 'Add title at cursor',
    group: 'Insert',
    keys: ['T'],
    run: () => insert.addTitleAtCursor(),
    icon: 'title',
  },
  {
    id: 'track.addVideo',
    label: 'Add video track',
    group: 'Insert',
    keys: [],
    run: insert.addVideoTrack,
    icon: 'film',
  },
  {
    id: 'track.addAudio',
    label: 'Add audio track',
    group: 'Insert',
    keys: [],
    run: insert.addAudioTrack,
    icon: 'music',
  },
];
