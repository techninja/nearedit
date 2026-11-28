import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { spawnSync } from 'node:child_process';
import { COMMANDS, helpText } from './help.js';
import { kitCommand } from './kitCommand.js';
import { loadKit } from './kitFolder.js';
import { BIN } from './testkit.js';

let root;
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);
const TEXT = { type: 'text', text: '{slot.text}', font: '{font.body}', size: 4, at: 'bottom' };
/** Run the command in this process, collecting what it prints. */
const run = async (...args) => {
  const out = [];
  const code = await kitCommand(args, {
    out: (line) => out.push(line),
    err: (line) => out.push(line),
  });
  return { code, text: out.join('\n') };
};
const kitFolder = (name, kit, files = {}) => {
  const dir = join(root, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'kit.json'), typeof kit === 'string' ? kit : JSON.stringify(kit));
  for (const [file, bytes] of Object.entries(files)) writeFileSync(join(dir, file), bytes);
  return dir;
};

before(() => {
  root = mkdtempSync(join(tmpdir(), 'nearedit-kit-'));
  kitFolder('house', { name: 'House', tokens: { color: { primary: '#e11d48' } } });
  kitFolder(
    'acme',
    {
      ...{ name: 'Acme', description: 'Indigo and amber', extends: 'house' },
      tokens: { color: { accent: '#f59e0b' }, logo: { mark: 'mark.png', main: 'gone.png' } },
      fonts: [{ family: 'Acme Sans', weight: 700, file: 'sans.woff2' }],
      elements: {
        ticker: { label: 'Ticker', kind: 'overlay', slots: { text: {} }, layers: [TEXT] },
      },
    },
    { 'mark.png': PNG, 'sans.woff2': 'font', 'spare.png': PNG },
  );
});
after(() => rmSync(root, { recursive: true, force: true }));

describe('nearedit kit', () => {
  it('prints a built-in kit: tokens, elements, valid', async () => {
    const { code, text } = await run('builtin:documentary');
    assert.equal(code, 0);
    assert.match(text, /^Documentary \(documentary\) — builtin:documentary/);
    assert.match(text, /chain: builtin:documentary\n {2}key: {3}[0-9a-f]{20}/);
    assert.match(text, /color {3}background\* #0d0c0a/);
    assert.match(text, /lower-third\* {5}overlay, \d+ s\s+name, role\?/);
    assert.match(text, /builtin:documentary: valid$/);
    assert.ok(!text.includes('Files'));
  });

  it('prints a kit folder with its chain, what it sets itself, and its files', async () => {
    const dir = join(root, 'acme');
    const { code, text } = await run(dir);
    assert.equal(code, 0, text);
    assert.match(text, new RegExp(`^Acme \\(acme\\) — ${dir}\\n {2}Indigo and amber`));
    assert.match(text, /chain: acme → house → builtin:clean/);
    assert.match(text, /primary #e11d48, accent\* #f59e0b/, 'inherited, and its own marked');
    assert.match(
      text,
      /logo {4}main\* gone\.png, mark\* mark\.png, initials —/,
      'its files by their names',
    );
    assert.match(text, /ticker\* {10}overlay, 5 s\s+text/);
    assert.match(text, /lower-third {6}overlay/);
    assert.match(text, /mark\.png\s+70 B {2}tokens\.logo\.mark/);
    assert.match(text, /sans\.woff2\s+4 B {2}fonts\[0\]\.file/);
    assert.match(text, /spare\.png\s+70 B {2}not used by the kit/);
    assert.match(text, /warning tokens\.logo\.main: "gone\.png" is not in the kit folder/);
    assert.match(text, new RegExp(`${dir}: valid \\(\\d+ warnings?\\)$`));
    assert.equal((await run(join(dir, 'kit.json'))).code, 0, 'its kit.json names it too');
  });

  it('answers machines with --json', async () => {
    const { code, text } = await run(join(root, 'acme'), '--json');
    const report = JSON.parse(text);
    assert.equal(code, 0);
    assert.deepEqual(
      [report.id, report.name, report.extends, report.valid, report.chain],
      ['acme', 'Acme', 'house', true, ['acme', 'house', 'builtin:clean']],
    );
    assert.equal(report.tokens.color.primary, '#e11d48');
    assert.deepEqual(report.own.color, { accent: '#f59e0b' });
    assert.equal(report.elements.length, 10);
    assert.deepEqual(report.elements.at(-1).slots, [
      { name: 'text', label: 'text', optional: false },
    ]);
    assert.deepEqual(
      report.files.map((file) => [file.name, file.used]),
      [
        ...[
          ['mark.png', ['tokens.logo.mark']],
          ['sans.woff2', ['fonts[0].file']],
          ['spare.png', []],
        ],
      ],
    );
    assert.deepEqual(report.errors, []);
    assert.deepEqual(
      report.warnings.map((warning) => warning.path),
      ['tokens.logo.main'],
    );
    assert.equal(report.fonts[0].file, join(root, 'acme', 'sans.woff2'));
  });

  it('exits 1 for a kit that does not validate, with every problem and its place', async () => {
    const bad = kitFolder('bad', {
      extends: 'ghost',
      tokens: { color: { text: '#12' }, logo: { main: '../x.png' } },
    });
    const { code, text } = await run(bad);
    assert.equal(code, 1);
    assert.match(text, /error {3}tokens\.color\.text: is not a usable color/);
    assert.match(text, /error {3}tokens\.logo\.main: "\.\.\/x\.png" leaves the kit folder/);
    assert.match(text, /error {3}extends: Kit "bad" extends "ghost", which was not found/);
    assert.match(text, /bad: invalid \(3 errors\)$/);
    const json = JSON.parse((await run(bad, '--json')).text);
    assert.deepEqual([json.valid, json.errors.length], [false, 3]);
    const broken = await run(kitFolder('broken', '{ "name": '));
    assert.equal(broken.code, 1);
    assert.match(broken.text, /error {3}kit\.json cannot be read/);
  });

  it('goes by the id the kit gives itself, and reads through a linked folder', () => {
    kitFolder('acme v2 (final)', { id: 'acme', name: 'Acme 2' });
    assert.equal(loadKit(join(root, 'acme v2 (final)')).effective.id, 'acme');
    kitFolder('unnamed folder', { name: 'No id' });
    assert.equal(loadKit(join(root, 'unnamed folder')).effective.id, 'kit');
    symlinkSync(join(root, 'acme'), join(root, 'alias'));
    const linked = loadKit(join(root, 'alias'));
    assert.deepEqual(linked.chain, ['acme', 'house', 'builtin:clean']);
    assert.deepEqual(
      linked.problems.filter((problem) => problem.level === 'error'),
      [],
    );
  });

  it('finds the kits a kit extends in a library named with --library', async () => {
    const own = kitFolder(join('project', '.nearedit', 'kit'), { extends: 'acme', name: 'Own' });
    const alone = await run(own);
    assert.equal(alone.code, 1);
    assert.match(alone.text, /Kit "kit" extends "acme", which was not found/);
    const { code, text } = await run(own, '--library', root);
    assert.equal(code, 0, text);
    assert.match(text, /chain: kit → acme → house → builtin:clean/);
    await assert.rejects(
      run(own, '--library', join(root, 'nowhere')),
      /--library .*nowhere: no such folder/,
    );
  });

  it('says what is wrong with how it was called', () => {
    const cli = (...args) =>
      spawnSync(process.execPath, [BIN, ...args], { encoding: 'utf8', cwd: root });
    const missing = cli('kit', 'nowhere');
    assert.equal(missing.status, 1);
    assert.match(missing.stderr, /nearedit: Cannot read kit .*nowhere: no such folder/);
    assert.match(cli('kit', '.').stderr, /is not a kit folder: it has no kit\.json/);
    assert.match(
      cli('kit', 'builtin:nope').stderr,
      /There is no built-in kit "builtin:nope"\. There are: builtin:clean/,
    );
    assert.equal(cli('kit').status, 2);
    assert.equal(cli('kit', 'acme', '--wide').status, 2);
    const relative = cli('kit', 'acme');
    assert.equal(relative.status, 0, relative.stderr);
    assert.match(relative.stdout, /^Acme \(acme\) — /);
  });
});

describe('nearedit help: brand kits', () => {
  it('explains restyle and kit, lists them, and names kits where catalog is described', () => {
    assert.deepEqual(COMMANDS.slice(-3), ['restyle', 'kit', 'help']);
    const overview = helpText();
    assert.match(
      overview,
      /nearedit restyle {2}<edl\.json \| folder> --kit <kit folder \| builtin:name>/,
    );
    assert.match(overview, /nearedit kit {6}<kit folder \| builtin:name> \[--json\]/);
    for (const option of ['--kit', '--only', '--output', '--dry-run', 'Exits 1'])
      assert.ok(helpText('restyle').includes(option), option);
    assert.match(helpText('kit'), /--json/);
    assert.match(helpText('catalog'), /built-in brand kits/);
    assert.match(helpText('catalog'), /nearedit kit <kit folder>/);
    const lines = [overview, helpText('restyle'), helpText('kit')].join('\n').split('\n');
    assert.deepEqual(
      lines.filter((line) => line.length > 100),
      [],
      'fits a terminal',
    );
  });
});
