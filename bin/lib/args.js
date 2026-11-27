/**
 * Command-line arguments for `nearedit`: a tiny, strict parser. Every
 * mistake — an unknown option, a missing value, a number that is not one —
 * becomes a `UsageError` whose message says what was expected.
 * @module bin/lib/args
 */

/** A mistake in how the tool was called (exit code 2). */
export class UsageError extends Error {
  /**
   * @param {string} message
   * @param {string} [command] - Whose usage to show with the message
   */
  constructor(message, command = '') {
    super(message);
    this.name = 'UsageError';
    this.command = command;
  }
}

/**
 * @typedef {Object} OptionSpec
 * @property {string} [short] - One-letter alias, e.g. "o"
 * @property {'string'|'number'|'flag'|'list'} type - `list` may be given several times
 * @property {string[]} [choices] - Allowed values
 */

/**
 * Parse the arguments of one command.
 * @param {string[]} argv - Everything after the command name
 * @param {Record<string, OptionSpec>} spec - Options by long name
 * @param {string} command - For error messages
 * @returns {{ values: Record<string, any>, rest: string[] }} `rest` holds the
 *   positional arguments
 * @throws {UsageError}
 */
export function parseArgs(argv, spec, command) {
  /** @type {Record<string, any>} */
  const values = {};
  const rest = [];
  const byShort = Object.fromEntries(
    Object.entries(spec).flatMap(([name, option]) => (option.short ? [[option.short, name]] : [])),
  );
  const known = Object.keys(spec).map((name) => `--${name}`);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--') {
      rest.push(...argv.slice(i + 1));
      break;
    }
    // A lone "-" and negative numbers are values, not options.
    if (!arg.startsWith('-') || arg === '-' || /^-\d/.test(arg)) {
      rest.push(arg);
      continue;
    }
    const [flag, inline] = arg.startsWith('--') ? arg.split(/=(.*)/s) : [arg, undefined];
    const name = flag.startsWith('--') ? flag.slice(2) : byShort[flag.slice(1)];
    const option = name ? spec[name] : undefined;
    if (!option) {
      const hint = known.length ? ` It takes: ${known.join(', ')}.` : ' It takes no options.';
      throw new UsageError(`"${command}" has no option ${flag}.${hint}`, command);
    }
    if (option.type === 'flag') {
      values[name] = true;
      continue;
    }
    const value = inline ?? argv[++i];
    if (value === undefined) throw new UsageError(`--${name} needs a value.`, command);
    if (option.choices && !option.choices.includes(value))
      throw new UsageError(`--${name} must be one of: ${option.choices.join(', ')}.`, command);
    if (option.type === 'number') {
      if (value.trim() === '' || !Number.isFinite(Number(value)))
        throw new UsageError(`--${name} must be a number, not "${value}".`, command);
      values[name] = Number(value);
    } else if (option.type === 'list') {
      values[name] = [...(values[name] || []), value];
    } else {
      values[name] = value;
    }
  }
  return { values, rest };
}

/**
 * Parse `start:end` in seconds; either side may be left out (`:10`, `5:`).
 * @param {string} text
 * @param {string} command
 * @returns {{ start: number, end: number }} `end` is Infinity when left out
 * @throws {UsageError}
 */
export function parseRange(text, command) {
  const match = /^\s*(\d*\.?\d*)\s*:\s*(\d*\.?\d*)\s*$/.exec(text);
  const start = match && match[1] !== '' ? Number(match[1]) : 0;
  const end = match && match[2] !== '' ? Number(match[2]) : Infinity;
  if (!match || !(start >= 0) || !(end > start))
    throw new UsageError(
      `--range must look like start:end in seconds with start before end (5:12.5), not "${text}".`,
      command,
    );
  return { start, end };
}

/**
 * The command a mistyped one probably meant.
 * @param {string} word
 * @param {string[]} commands
 * @returns {string} '' when nothing is close
 */
export function closest(word, commands) {
  const distance = (a, b) => {
    const row = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      let previous = row[0];
      row[0] = i;
      for (let j = 1; j <= b.length; j++) {
        const keep = row[j];
        row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
        previous = keep;
      }
    }
    return row[b.length];
  };
  const ranked = commands.map((name) => ({ name, d: distance(word.toLowerCase(), name) }));
  ranked.sort((a, b) => a.d - b.d);
  return ranked[0] && ranked[0].d <= 2 ? ranked[0].name : '';
}
