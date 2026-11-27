/**
 * Command catalog — the time selection (which is also the loop region),
 * regions and named markers, and the post-edit ripple with its scopes.
 * @module utils/commands/catalogSelection
 */

import { getUserPrefs } from '#store/UserPrefs.js';
import { commandsFor } from './catalogKit.js';
import { canTrimToSelection, trimToSelection } from './edit.js';
import * as marks from './marks.js';
import { canPostRipple, postEditRipple } from './postRipple.js';
import * as time from './timeSelection.js';
import { setRippleScope } from './viewCommands.js';

const select = commandsFor('Selection');
const edit = commandsFor('Edit');
const insert = commandsFor('Insert');
const mode = commandsFor('Modes');

/** @typedef {import('./registry.js').Command} Command */
/** @typedef {'track'|'marks'|'all'} Scope */

/** @type {(id: string, label: string, keys: string[], scope: Scope) => Command} */
const post = (id, label, keys, scope) =>
  edit(id, label, keys, () => postEditRipple(scope), { enabled: canPostRipple, icon: 'ripple' });

/** @type {(id: string, label: string, scope: Scope) => Command} */
const auto = (id, label, scope) =>
  mode(id, label, [], () => setRippleScope(scope), {
    pressed: () => getUserPrefs().rippleScope === scope,
  });

const left = ['Alt+Shift+ArrowLeft'];
const right = ['Alt+Shift+ArrowRight'];
const toEdit = { left: ['Ctrl+Alt+Shift+ArrowLeft'], right: ['Ctrl+Alt+Shift+ArrowRight'] };

/** @type {Command[]} */
export const SELECTION_COMMANDS = [
  select('select.markIn', 'Mark in: the time selection starts at the cursor', ['I'], time.markIn),
  select('select.markOut', 'Mark out: the time selection ends at the cursor', ['O'], time.markOut),
  select('select.extendLeft', 'Extend the time selection one pixel left', left, () =>
    time.extendByPixel(-1),
  ),
  select('select.extendRight', 'Extend the time selection one pixel right', right, () =>
    time.extendByPixel(1),
  ),
  select(
    'select.extendPreviousEdit',
    'Extend the time selection to the edit before',
    toEdit.left,
    () => time.extendToEdit(-1),
  ),
  select('select.extendNextEdit', 'Extend the time selection to the edit after', toEdit.right, () =>
    time.extendToEdit(1),
  ),
  select('select.recall', 'Recall the previous time selection', [], time.recallSelection, {
    enabled: time.canRecallSelection,
  }),
  edit('edit.trimToSelection', 'Trim to the time selection', ['Alt+T'], trimToSelection, {
    enabled: canTrimToSelection,
    icon: 'trim',
  }),
  post('ripple.postTracks', 'Ripple the last edit: its tracks', ['F'], 'track'),
  post('ripple.postMarks', 'Ripple the last edit: tracks, markers, regions', ['Shift+F'], 'marks'),
  post('ripple.postAll', 'Ripple the last edit: every track and mark', ['Mod+Shift+F'], 'all'),
  insert('region.add', 'Add a region over the time selection', ['Shift+R'], marks.addRegionNow, {
    enabled: marks.canAddRegion,
    icon: 'region',
  }),
  insert('marker.addNamed', 'Add a marker and name it', ['Shift+M'], marks.addNamedMarker),
  auto('ripple.scopeTracks', 'Auto ripple carries: affected tracks', 'track'),
  auto('ripple.scopeMarks', 'Auto ripple carries: also markers and regions', 'marks'),
  auto('ripple.scopeAll', 'Auto ripple carries: every track and mark', 'all'),
];
