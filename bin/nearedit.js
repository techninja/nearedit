#!/usr/bin/env node
/**
 * `nearedit` — the editor without the editor: check a timeline document,
 * look at single frames of it, and render it, from a shell. It runs the
 * server's own renderer in-process; no server needs to be running, and it
 * works from any directory.
 *
 *   nearedit render <edl.json> [-o out.mp4] [--preset …] [--range start:end]
 *   nearedit frame <edl.json> --time <seconds> [-o frame.png] [--width n]
 *   nearedit validate <edl.json>
 *   nearedit record <recipe.json> [-o out.mp4] [--fps n] [--allow host]
 *   nearedit music <song.json> [-o out.wav]
 *   nearedit catalog [--json]
 *
 * Reference: docs/app-spec/COMPOSITOR.md § Authoring without the UI.
 * @module bin/nearedit
 */

import { UsageError, closest } from './lib/args.js';
import { COMMANDS, helpText } from './lib/help.js';

const io = {
  out: (/** @type {string} */ line) => void process.stdout.write(`${line}\n`),
  err: (/** @type {string} */ line) => void process.stderr.write(`${line}\n`),
};

/**
 * Run a command line.
 * @param {string[]} argv - Arguments after the program name
 * @returns {Promise<number>} Exit code
 */
async function main(argv) {
  const [command, ...rest] = argv;
  const wantsHelp = rest.includes('--help') || rest.includes('-h');
  if (!command || command === 'help' || command === '--help' || command === '-h') {
    const topic = command === 'help' ? rest[0] : undefined;
    if (topic && !COMMANDS.includes(topic))
      throw new UsageError(`There is no "${topic}" command to explain.`);
    io.out(helpText(topic));
    return 0;
  }
  if (!COMMANDS.includes(command)) {
    const near = closest(command, COMMANDS);
    throw new UsageError(`Unknown command "${command}".${near ? ` Did you mean "${near}"?` : ''}`);
  }
  if (wantsHelp) {
    io.out(helpText(command));
    return 0;
  }
  // Each command loads only what it needs: `help` and a typo answer at once.
  if (command === 'render') return (await import('./lib/renderCommand.js')).renderCommand(rest, io);
  if (command === 'frame') return (await import('./lib/frameCommand.js')).frameCommand(rest, io);
  if (command === 'validate')
    return (await import('./lib/validateCommand.js')).validateCommand(rest, io);
  if (command === 'record') return (await import('./lib/recordCommand.js')).recordCommand(rest, io);
  if (command === 'music') return (await import('./lib/musicCommand.js')).musicCommand(rest, io);
  return (await import('./lib/catalogCommand.js')).catalogCommand(rest, io);
}

main(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code;
  },
  (err) => {
    if (err instanceof UsageError) {
      io.err(`nearedit: ${err.message}`);
      io.err('');
      io.err(err.command ? helpText(err.command) : 'Run "nearedit help" to see the commands.');
      process.exitCode = 2;
      return;
    }
    // A bad document, an unreadable file, a failed encode: the message is the report.
    io.err(`nearedit: ${err.message}`);
    if (process.env.NEAREDIT_DEBUG) io.err(err.stack);
    process.exitCode = 1;
  },
);
