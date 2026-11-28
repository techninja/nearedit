import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { recipeKey } from '#utils/web/index.js';
import { readFrames } from '../src/api/render/testkit.js';
import * as kit from '../tests/web/kit.js';
import { startSite } from '../tests/web/site.js';
import { BIN, probe } from './lib/testkit.js';

/**
 * The command line and web clips: `record`, and documents whose web clips
 * `render` and `frame` record first. The tool runs as a process of its own;
 * the pages come from this one, so it is never waited for synchronously.
 */

describe('nearedit command line: web clips', { skip: kit.SKIP }, () => {
  const project = join(kit.SCRATCH, 'project');
  const elsewhere = join(kit.SCRATCH, 'elsewhere');
  let site;
  let allow;
  const cli = (...args) =>
    new Promise((resolve) => {
      const child = spawn(process.execPath, [BIN, ...args], { cwd: elsewhere });
      const said = { out: '', err: '' };
      child.stdout.on('data', (chunk) => (said.out += chunk));
      child.stderr.on('data', (chunk) => (said.err += chunk));
      child.on('close', (code) => resolve({ code, ...said }));
    });
  const save = (name, content) => {
    const path = join(project, name);
    writeFileSync(path, JSON.stringify(content));
    return path;
  };
  const recipe = (
    steps = [{ do: 'click', target: 'text=Switch the lamp', duration: 0.3, hold: 0.4 }],
  ) => ({
    ...kit.SMALL,
    url: `${site.url}/`,
    steps,
  });
  /** A page for 1.3 s under a title, 640 × 360 at 30 fps. */
  const document = (web) => ({
    fps: 30,
    resolution: '640x360',
    tracks: [
      {
        type: 'video',
        clips: [{ timelineStart: 0, timelineEnd: 0.5, text: { content: 'Demo', fontSize: 40 } }],
      },
      { type: 'video', clips: [{ timelineStart: 0, web }] },
    ],
  });

  before(async () => {
    for (const dir of [project, elsewhere]) mkdirSync(dir, { recursive: true });
    site = await startSite();
    allow = ['--allow', site.allow];
  });
  after(async () => {
    await site.close();
    assert.deepEqual(kit.leftovers(), { processes: [], profiles: [] });
    kit.cleanup();
  });

  it('records a recipe: the path on stdout, progress on stderr, the track beside it', async () => {
    const file = save('demo.json', recipe());
    const done = await cli('record', file, ...allow);
    assert.equal(done.code, 0, done.err);
    assert.equal(done.out, `${join(project, 'demo.mp4')}\n`);
    assert.match(
      done.err,
      new RegExp(`^recording ${site.url}/ \\(1\\.1 s, 33 frames\\)\\nframe \\d+ of 33\\n`),
    );
    const [video] = probe(join(project, 'demo.mp4'));
    assert.deepEqual(
      [video.codec_name, video.width, video.height, video.nb_read_frames],
      ['h264', 640, 360, '33'],
    );
    const track = JSON.parse(readFileSync(join(project, 'demo.track.json'), 'utf8'));
    assert.deepEqual(
      [track.key, track.title, track.steps.length],
      [recipeKey(recipe(), 30), 'NearEdit test site', 1],
    );
    assert.deepEqual(track.steps[0].rect, { x: 40, y: 120, width: 160, height: 40 });
    assert.deepEqual(
      JSON.parse(readFileSync(file, 'utf8')),
      recipe(),
      'the recipe itself is untouched',
    );

    const named = await cli(
      'record',
      file,
      '-o',
      join(kit.SCRATCH, 'out', 'take'),
      '--fps',
      '25',
      ...allow,
    );
    assert.equal(named.out, `${join(kit.SCRATCH, 'out', 'take.mp4')}\n`);
    assert.equal(probe(join(kit.SCRATCH, 'out', 'take.mp4'))[0].r_frame_rate, '25/1');
    assert.ok(existsSync(join(kit.SCRATCH, 'out', 'take.track.json')));
  });

  it('refuses private addresses unless allowed, and says what is wrong with a recipe', async () => {
    const file = save('private.json', recipe([]));
    const refused = await cli('record', file);
    assert.equal(refused.code, 1);
    assert.match(
      refused.err,
      /was refused: 127\.0\.0\.1 is a private address \(loopback\)\. To record it anyway, allow it: --allow 127\.0\.0\.1:\d+\n$/,
    );
    assert.equal(existsSync(join(project, 'private.mp4')), false);
    const missing = await cli(
      'record',
      save('lost.json', recipe([{ do: 'click', target: 'text=Nowhere' }])),
      ...allow,
    );
    assert.deepEqual([missing.code, missing.out], [1, '']);
    assert.match(
      missing.err,
      /nearedit: Step 1 \(click\): nothing on the page matches text=Nowhere\n$/,
    );

    const bad = await cli(
      'record',
      save('bad.json', { url: 'example.com', steps: [{ do: 'click' }, { do: 'fly' }] }),
    );
    assert.equal(bad.code, 1);
    assert.match(bad.err, /^error {3}url: "example\.com" is not a web address/);
    assert.match(bad.err, /\nerror {3}steps\[0\]\.target: click needs a target/);
    assert.match(bad.err, /\nerror {3}steps\[1\]\.do: "fly" is not a step: use one of wait, move/);
    assert.match(bad.err, /bad\.json cannot be recorded: 3 error\(s\) above\n$/);
    writeFileSync(join(project, 'broken.json'), '{ "url": ');
    assert.match(
      (await cli('record', join(project, 'broken.json'))).err,
      /broken\.json is not valid JSON \(line 1/,
    );
    assert.deepEqual(
      [(await cli('record')).code, (await cli('record', file, '--fps', '0')).code],
      [2, 2],
    );
    const help = await cli('help', 'record');
    assert.match(
      help.out,
      /^nearedit record <recipe\.json> \[-o out\.mp4\] \[--fps n\] \[--allow host\[:port\]\]/,
    );
    assert.match((await cli('help')).out, /nearedit record {3}<recipe\.json>/);
  });

  it('validates a document with web clips without starting a browser', async () => {
    const good = await cli('validate', save('page.json', document({ recipe: recipe() })));
    assert.equal(good.code, 0, good.out);
    assert.match(
      good.out,
      /^warning tracks\[1\]\.clips\[0\]\.web: web clip not recorded yet: "nearedit render" and "frame" record it first\n/,
    );
    assert.match(
      good.out,
      /page\.json: valid — 640x360 at 30 fps, 1\.1 s, 2 clips \(1 warning\)\n$/,
    );
    const steps = [{ do: 'wait' }, { do: 'click' }];
    const bad = await cli(
      'validate',
      save('badpage.json', document({ recipe: { url: `${site.url}/`, steps } })),
      '--json',
    );
    assert.equal(bad.code, 1);
    const report = JSON.parse(bad.out);
    assert.equal(report.valid, false);
    assert.deepEqual(
      report.errors.map((error) => error.path),
      ['tracks[1].clips[0].web.recipe.steps[1].target'],
    );
    assert.match(report.errors[0].message, /click needs a target/);
    assert.equal(existsSync(join(project, '.nearedit')), false, 'nothing was recorded');
    // A page and nothing else: it will be footage once `render` has recorded it.
    const only = {
      fps: 30,
      resolution: '640x360',
      tracks: [{ type: 'video', clips: [{ timelineStart: 0, web: { recipe: recipe() } }] }],
    };
    const alone = await cli('validate', save('only.json', only));
    assert.equal(alone.code, 0, alone.out);
    assert.match(
      alone.out,
      /only\.json: valid — 640x360 at 30 fps, 1\.1 s, 1 clip \(1 warning\)\n$/,
    );
  });

  it('records the web clips of a document before drawing a frame or rendering', async () => {
    const file = save('page.json', document({ recipe: recipe() }));
    const key = recipeKey(recipe(), 30);
    const blocked = await cli('frame', file, '--time', '1');
    assert.equal(blocked.code, 1);
    assert.match(
      blocked.err,
      /was refused: 127\.0\.0\.1 is a private address.*allow it: --allow 127/,
    );

    const shot = await cli('frame', file, '--time', '1', ...allow);
    assert.equal(shot.code, 0, shot.err);
    assert.match(shot.err, new RegExp(`^recording ${site.url}/ \\(1\\.1 s, 33 frames\\)`));
    assert.deepEqual(readdirSync(join(project, '.nearedit', 'web')).sort(), [
      `${key}.json`,
      `${key}.mp4`,
    ]);
    const png = await readFrames(shot.out.trim(), 640, 360);
    // One second in: the click at 0.5 s has lit the lamp, and the pointer rests on the button.
    assert.ok(
      kit.near(png.at(0, 260, 140), [255, 255, 0], 30),
      `the page, as recorded: ${png.at(0, 260, 140)}`,
    );
    assert.ok(kit.near(png.at(0, 500, 300), [255, 255, 255], 12));

    const render = await cli('render', file, '-o', join(kit.SCRATCH, 'out', 'page.mp4'));
    assert.equal(render.code, 0, render.err);
    assert.doesNotMatch(render.err, /recording/, 'the recording is there: no browser this time');
    const [video] = probe(join(kit.SCRATCH, 'out', 'page.mp4'));
    assert.deepEqual([video.width, video.height, video.nb_read_frames], [640, 360, '33']);
    const frames = await readFrames(join(kit.SCRATCH, 'out', 'page.mp4'), 640, 360);
    assert.ok(kit.near(frames.at(5, 260, 140), [0, 0, 0], 30), 'the lamp is dark at first');
    assert.ok(kit.near(frames.at(30, 260, 140), [255, 255, 0], 30), 'and lit after the click');
    assert.equal(
      JSON.parse(readFileSync(file, 'utf8')).tracks[1].clips[0].web.key,
      undefined,
      'the document is not rewritten',
    );
    const valid = await cli('validate', file);
    assert.match(valid.out, /page\.json: valid — 640x360 at 30 fps, 1\.1 s, 2 clips\n$/);

    // A changed recipe is another recording; the old one stays.
    const changed = save(
      'page.json',
      document({ recipe: recipe([{ do: 'wait', duration: 0.2 }]) }),
    );
    const again = await cli(
      'render',
      changed,
      '-o',
      join(kit.SCRATCH, 'out', 'page2.mp4'),
      ...allow,
    );
    assert.equal(again.code, 0, again.err);
    assert.match(again.err, /^recording /);
    assert.equal(readdirSync(join(project, '.nearedit', 'web')).length, 4);
    assert.equal(probe(join(kit.SCRATCH, 'out', 'page2.mp4'))[0].nb_read_frames, '18');
  });
});
