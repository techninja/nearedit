/**
 * `nearedit catalog` — what a document may name: generators and effects
 * with their parameters, blend modes, easings, text animations and fonts.
 * Read straight from the compositor, so it is never out of date.
 * @module bin/lib/catalogCommand
 */

import { brandCatalog } from '#utils/brand/catalog.js';
import { catalog } from '#utils/compose/index.js';
import { parseArgs, UsageError } from './args.js';

const OPTIONS = { json: { type: /** @type {'flag'} */ ('flag') } };
/** The parts of the catalog this command knows how to lay out. */
const SECTIONS = [
  ...['generators', 'effects', 'effectPresets', 'blendModes'],
  ...['easings', 'textAnimations', 'textUnits', 'fonts', 'kits'],
];

/**
 * The built-in brand kits: each element with its kind, its length and its slots.
 * @param {ReturnType<typeof brandCatalog>} kits
 * @returns {string[]}
 */
function kitLines(kits) {
  const lines = ['Brand kits — built in; a kit of your own names one in "extends"'];
  for (const kit of kits) {
    lines.push(`  ${kit.extends} — ${kit.name}: ${kit.description}`);
    for (const element of kit.elements) {
      const slots = element.slots.map((slot) => `${slot.name}${slot.optional ? '?' : ''}`);
      const what = `${element.kind}, ${element.duration} s`;
      lines.push(`    ${element.id.padEnd(16)} ${what.padEnd(18)} ${slots.join(', ') || '—'}`);
    }
  }
  return [...lines, ''];
}

/**
 * One parameter as a line: name, type and range, default, whether it animates.
 * @param {string} name
 * @param {any} spec
 * @returns {string}
 */
function paramLine(name, spec) {
  const range =
    spec.type === 'number' && (spec.min !== undefined || spec.max !== undefined)
      ? ` ${spec.min ?? ''}..${spec.max ?? ''}${spec.unit ? ` ${spec.unit}` : ''}`
      : spec.type === 'select'
        ? ` ${spec.options.join('|')}`
        : '';
  const preset = `= ${JSON.stringify(spec.default)}`;
  return `    ${name.padEnd(16)} ${`${spec.type}${range}`.padEnd(34)} ${preset}${spec.animatable ? '  (animatable)' : ''}`;
}

/**
 * @param {string} title
 * @param {any[]} modules - Generators or effects as data
 * @returns {string[]}
 */
function moduleLines(title, modules) {
  const lines = [title];
  for (const module of modules) {
    lines.push(
      `  ${module.type} — ${module.label}${module.description ? `: ${module.description}` : ''} [${module.category}]`,
    );
    for (const [name, spec] of Object.entries(module.params)) lines.push(paramLine(name, spec));
  }
  return [...lines, ''];
}

/**
 * @param {string[]} argv
 * @param {{ out: (line: string) => void }} io
 * @returns {Promise<number>} Exit code
 */
export async function catalogCommand(argv, io) {
  const { values, rest } = parseArgs(argv, OPTIONS, 'catalog');
  if (rest.length) throw new UsageError(`catalog takes no arguments, got "${rest[0]}".`, 'catalog');
  /** @type {any} */
  const all = { ...catalog(), kits: brandCatalog() };
  if (values.json) {
    io.out(JSON.stringify(all, null, 2));
    return 0;
  }
  const names = (/** @type {any[]} */ list) =>
    list
      .map((entry) => (typeof entry === 'string' ? entry : entry.id || entry.type || entry.name))
      .join(', ');
  // Ready-made effect stacks, when the catalog has them: what each is made of.
  const presets = (all.effectPresets || []).map(
    (/** @type {any} */ preset) =>
      `  ${preset.name} — ${preset.description || preset.label} [${names(preset.effects)}]`,
  );
  // Whatever the catalog grows next is at least named here; --json has it in full.
  const more = Object.keys(all)
    .filter((key) => !SECTIONS.includes(key) && Array.isArray(all[key]))
    .map((key) => `${key}\n  ${names(all[key])}\n`);
  const fonts = all.fonts.map(
    (/** @type {any} */ font) =>
      `  ${font.id}${font.generic ? ` (${font.generic})` : ''}: weights ${font.weights.join(', ')}`,
  );
  const lines = [
    ...moduleLines('Generators — clip.generator = { type, seed, params }', all.generators),
    ...moduleLines(
      'Effects — clip.effects[] / track.effects[] = { effectId, type, enabled, params }',
      all.effects,
    ),
    ...(presets.length ? ['Effect presets — stacks of effects to copy into "effects"'] : []),
    ...presets,
    ...(presets.length ? [''] : []),
    `Blend modes — clip.blendMode, track.blendMode\n  ${names(all.blendModes)}\n`,
    `Easings — keyframe "ease"\n  ${names(all.easings)}\n`,
    `Text animations — text.animateIn.type, text.animateOut.type\n  ${names(all.textAnimations)}`,
    `  by: ${names(all.textUnits)}\n`,
    'Fonts — text.fontFamily',
    ...fonts,
    '',
    ...kitLines(all.kits),
    ...more,
    'Every parameter is optional; a document stores only what differs from the default.',
    'The same as JSON: nearedit catalog --json',
  ];
  io.out(lines.join('\n'));
  return 0;
}
