/**
 * A short way to write catalog entries, so that a table of commands reads
 * as a table.
 * @module utils/commands/catalogKit
 */

/** @typedef {import('./registry.js').Command} Command */

/**
 * @param {string} group - Heading the commands appear under
 * @returns {(id: string, label: string, keys: string[], run: () => unknown,
 *   more?: Partial<Command>) => Command} Makes one command of that group
 */
export function commandsFor(group) {
  return (id, label, keys, run, more = {}) => ({ id, label, group, keys, run, ...more });
}
