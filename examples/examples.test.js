import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Every example is checked and drawn through the command line, as a reader would. */

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const EXAMPLES = [
  { file: 'examples/made-from-nothing/made-from-nothing.json', clips: 25, time: 12 },
  { file: 'examples/falling-logos/falling-logos.json', clips: 3, time: 3 },
  { file: 'examples/logo-sting/opening.json', clips: 14, time: 3 },
  { file: 'examples/logo-sting/opening-tall.json', clips: 14, time: 3 },
  { file: 'examples/logo-sting/wipe.json', clips: 8, time: 0.2 },
  { file: 'examples/logo-sting/wipe-tall.json', clips: 8, time: 0.2 },
];

/** Brand kits kept as folders: what `nearedit kit` must find in each. */
const KITS = [{ folder: 'examples/kits/nearedit', files: ['logo.png', 'mark.png'] }];

/**
 * @param {...string} args
 * @returns {{ code: number|null, out: string, err: string }}
 */
function nearedit(...args) {
  const run = spawnSync(process.execPath, ['bin/nearedit.js', ...args], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  return { code: run.status, out: run.stdout, err: run.stderr };
}

describe('examples through the command line', () => {
  /** @type {string} */
  let dir;
  before(() => {
    dir = mkdtempSync(join(tmpdir(), 'nearedit-examples-'));
  });
  after(() => rmSync(dir, { recursive: true, force: true }));

  for (const { file, clips, time } of EXAMPLES) {
    it(`${file} is valid`, () => {
      const { code, out, err } = nearedit('validate', file);
      assert.equal(code, 0, err);
      assert.match(out, new RegExp(`valid — .*, ${clips} clips`));
      assert.doesNotMatch(out + err, /warning/i);
    });

    it(`${file} draws a frame`, () => {
      const png = join(dir, `${basename(file, '.json')}.png`);
      const { code, err } = nearedit('frame', file, '--time', String(time), '-o', png);
      assert.equal(code, 0, err);
      assert.ok(statSync(png).size > 20000, 'the frame is not an empty picture');
    });
  }

  for (const { folder, files } of KITS) {
    it(`${folder} is a valid kit that brings its logo files`, () => {
      const { code, out, err } = nearedit('kit', folder, '--json');
      assert.equal(code, 0, err);
      const kit = JSON.parse(out);
      assert.equal(kit.valid, true);
      assert.deepEqual([kit.errors, kit.warnings], [[], []]);
      assert.deepEqual(kit.files.map((entry) => entry.name).sort(), files);
      assert.ok(
        kit.files.every((entry) => entry.used.length),
        'every file is named by a token',
      );
    });
  }
});
