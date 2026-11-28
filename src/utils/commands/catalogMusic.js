/**
 * Command catalog — music clips. Joins the Edit group of the registry.
 * @module utils/commands/catalogMusic
 */

import { commandsFor } from './catalogKit.js';
import * as music from './music.js';

/** @typedef {import('./registry.js').Command} Command */

const change = commandsFor('Edit');

/** @type {Command[]} */
export const MUSIC_COMMANDS = [
  change('music.edit', 'Edit music…', ['Alt+M'], music.editMusic, {
    enabled: music.hasMusicClip,
    icon: 'music',
  }),
  change('music.exportMidi', 'Export music as MIDI', [], music.exportSelectedMidi, {
    enabled: music.hasMusicClip,
  }),
];
