/**
 * Command catalog — web clips. Joins the Edit group of the registry.
 * @module utils/commands/catalogWeb
 */

import { commandsFor } from './catalogKit.js';
import * as web from './web.js';

/** @typedef {import('./registry.js').Command} Command */

const change = commandsFor('Edit');

/** @type {Command[]} */
export const WEB_COMMANDS = [
  change('web.editSteps', 'Edit web clip steps…', ['Alt+W'], web.editWebSteps, {
    enabled: web.hasWebClip,
    icon: 'web',
  }),
  change('web.record', 'Record web clip', ['Alt+R'], web.recordSelectedWeb, {
    enabled: web.hasWebClip,
    icon: 'record',
  }),
  change('web.recordAll', 'Record all out-of-date web clips', [], web.recordStaleWeb, {
    enabled: web.hasStaleWeb,
  }),
];
