/**
 * Command catalog — keyframes, effects and generators. Each array joins
 * the group of the registry it belongs to.
 * @module utils/commands/catalogFx
 */

import { commandsFor } from './catalogKit.js';
import * as fx from './fx.js';

/** @typedef {import('./registry.js').Command} Command */

const go = commandsFor('Navigate');
const change = commandsFor('Edit');
const insert = commandsFor('Insert');

/** @type {Command[]} */
export const FX_NAVIGATE_COMMANDS = [
  go(
    'go.previousKeyframe',
    'Previous keyframe of the selection',
    [';'],
    () => fx.goToKeyframe(-1),
    {
      enabled: () => fx.keyframeFrom(-1) !== null,
    },
  ),
  go('go.nextKeyframe', 'Next keyframe of the selection', ["'"], () => fx.goToKeyframe(1), {
    enabled: () => fx.keyframeFrom(1) !== null,
  }),
];

/** @type {Command[]} */
export const FX_EDIT_COMMANDS = [
  change('keyframe.add', 'Add keyframe at the playhead', ['Shift+K'], fx.addKeyframeAtPlayhead, {
    enabled: fx.selectionIsAnimated,
    icon: 'keyframe-add',
  }),
  change(
    'keyframe.remove',
    'Remove keyframe at the playhead',
    ['Alt+K'],
    fx.removeKeyframeAtPlayhead,
    { enabled: fx.hasKeyAtPlayhead, icon: 'keyframe-remove' },
  ),
  change('keyframe.clear', 'Remove all keyframes', [], fx.clearKeyframes, {
    enabled: fx.selectionIsAnimated,
  }),
  change('clip.showEffects', 'Effects…', ['Alt+E'], fx.showEffects, { icon: 'effects' }),
  change('clip.bypassEffects', 'Bypass effects', ['Shift+E'], fx.bypassEffects, {
    enabled: fx.selectionHasEffects,
    pressed: () => fx.selectionHasEffects() && !fx.effectsAreOn(),
  }),
  change('edit.pasteAttributes', 'Paste attributes', ['Mod+Alt+V'], fx.pasteClipAttributes, {
    enabled: fx.canPasteAttributes,
    icon: 'paste-attrs',
  }),
];

/** @type {Command[]} */
export const FX_INSERT_COMMANDS = [
  insert('generator.addLast', 'Add generator (the last used)', ['Alt+G'], fx.addLastGenerator, {
    icon: 'generate',
  }),
];
