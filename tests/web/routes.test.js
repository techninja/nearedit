import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { recipeKey } from '#utils/web/index.js';
import { jobsRouter } from '../../src/api/jobs.js';
import { getJob } from '../../src/api/lib/jobs.js';
import { readFrames } from '../../src/api/render/testkit.js';
import { webRouter } from '../../src/api/web.js';
import * as kit from './kit.js';
import { startSite } from './site.js';

/** The web routes and the `web` job, through a mounted router. */

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

describe('web routes and job', { skip: kit.SKIP }, () => {
  const env = { ...process.env };
  const project = join(kit.SCRATCH, 'project');
  const web = join(project, '.nearedit', 'web');
  let site;
  let server;
  let base;
  const recipe = (steps = [], more = {}) => ({ ...kit.SMALL, url: `${site.url}/`, steps, ...more });
  const post = (path, body) =>
    fetch(base + path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  const finished = async (jobId) => {
    for (let i = 0; i < 600; i++) {
      const job = getJob(jobId);
      if (['complete', 'error', 'cancelled'].includes(job.status)) return job;
      await sleep(25);
    }
    throw new Error('job did not finish');
  };
  const recorded = async (body) => {
    const answer = await post('/web/record', body);
    assert.equal(answer.status, 202, await answer.clone().text());
    return finished((await answer.json()).jobId);
  };

  before(async () => {
    site = await startSite();
    process.env.NEAREDIT_DATA_DIR = join(kit.SCRATCH, 'data');
    process.env.NEAREDIT_MEDIA_DIR = join(kit.SCRATCH, 'media');
    process.env.GLOBAL_MEDIA_PATHS = '';
    process.env.WEB_CAPTURE_ALLOW = site.allow;
    for (const dir of ['data', 'media', 'project/.nearedit', 'outside'])
      mkdirSync(join(kit.SCRATCH, dir), { recursive: true });
    writeFileSync(
      join(project, '.nearedit', 'project.json'),
      JSON.stringify({ name: 'Site', adaptations: [] }),
    );
    writeFileSync(
      join(kit.SCRATCH, 'data', 'registry.json'),
      JSON.stringify({ p1: { path: project, name: 'Site' } }),
    );
    writeFileSync(join(kit.SCRATCH, 'outside', 'state.json'), '{"cookies":[]}');
    const app = express();
    app.use(express.json({ limit: '10mb' }));
    app.use('/api', jobsRouter, webRouter);
    server = app.listen(0, '127.0.0.1');
    await new Promise((resolve) => server.once('listening', resolve));
    base = `http://127.0.0.1:${server.address().port}/api`;
  });
  after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await site.close();
    process.env = env;
    assert.deepEqual(kit.leftovers(), { processes: [], profiles: [] });
    kit.cleanup();
  });

  it('reports the browser and what it may reach', async () => {
    const status = await (await fetch(`${base}/web/status`)).json();
    assert.deepEqual(Object.keys(status), ['available', 'browser', 'reason', 'allow']);
    assert.deepEqual([status.available, status.reason, status.allow], [true, '', [site.allow]]);
    assert.equal(status.browser.path, kit.BROWSER);
    assert.match(status.browser.version, /Chrome\/\d+/);
  });

  it('refuses what cannot be recorded before any job starts', async () => {
    const bad = await post('/web/record', {
      projectId: 'p1',
      recipe: { url: 'ftp://example.com', steps: [{ do: 'click' }, { do: 'jump' }] },
    });
    assert.equal(bad.status, 422);
    const { error, fields } = await bad.json();
    assert.equal(error, 'The recipe cannot be recorded');
    assert.deepEqual(Object.keys(fields), ['url', 'steps[0].target', 'steps[1].do']);
    assert.match(fields['steps[0].target'], /click needs a target/);
    assert.equal((await post('/web/record', { recipe: recipe() })).status, 400);
    assert.equal((await post('/web/record', { projectId: 'nope', recipe: recipe() })).status, 404);
    assert.equal(
      (await post('/web/record', { projectId: 'p1', recipe: recipe(), fps: 0 })).status,
      422,
    );
    const outside = recipe([], { storage: join(kit.SCRATCH, 'outside', 'state.json') });
    const denied = await post('/web/record', { projectId: 'p1', recipe: outside });
    assert.deepEqual(
      [denied.status, (await denied.json()).error],
      [403, 'Storage file: Path is outside the allowed media folders'],
    );
    const missing = await post('/web/record', {
      projectId: 'p1',
      recipe: recipe([], { storage: 'no.json' }),
    });
    assert.equal(missing.status, 404);
    assert.equal(existsSync(web), false, 'nothing was started');
    assert.equal((await fetch(`${base}/web/track?projectId=p1&key=../x`)).status, 400);
    assert.equal((await fetch(`${base}/web/track?projectId=p1&key=${'0'.repeat(20)}`)).status, 404);
    assert.equal((await fetch(`${base}/web/track?projectId=zz&key=${'0'.repeat(20)}`)).status, 404);
  });

  it('records in a job: progress, result, track, and no second recording', async () => {
    const body = { projectId: 'p1', fps: 25, recipe: recipe([{ do: 'click', target: '#toggle' }]) };
    const job = await recorded(body);
    assert.equal(job.status, 'complete', job.error);
    assert.deepEqual([job.type, job.projectId, job.progress], ['web', 'p1', 100]);
    assert.equal(job.label, `Record: 127.0.0.1:${site.port}`);
    const { result } = job;
    assert.deepEqual(Object.keys(result), [
      'file',
      'key',
      'duration',
      'fps',
      'width',
      'height',
      'title',
      'track',
      'cached',
    ]);
    assert.equal(
      result.key,
      recipeKey(body.recipe, 25),
      'the key of the recipe at the frame rate asked for',
    );
    assert.equal(result.file, join(web, `${result.key}.mp4`));
    assert.deepEqual(
      [result.fps, result.width, result.height, result.cached],
      [25, 640, 360, false],
    );
    assert.equal(result.duration, result.track.duration);
    const frames = Math.round(result.duration * 25);
    assert.ok(job.log.includes(`frame ${frames} of ${frames}`), job.log.slice(-3).join(' | '));
    assert.ok(job.log.length < 120, 'progress is reported per percent, not per frame');
    const full = await (await fetch(`${base}/jobs/${job.id}/result`)).json();
    assert.deepEqual(full, result);
    const track = await (await fetch(`${base}/web/track?projectId=p1&key=${result.key}`)).json();
    assert.deepEqual(track, result.track);
    const again = await recorded(body);
    assert.equal(again.result.cached, true);
    assert.deepEqual(readdirSync(web).sort(), [`${result.key}.json`, `${result.key}.mp4`]);

    const failed = await recorded({
      projectId: 'p1',
      recipe: recipe([{ do: 'click', target: 'text=Nowhere' }]),
    });
    assert.deepEqual(
      [failed.status, failed.error],
      ['error', 'Step 1 (click): nothing on the page matches text=Nowhere'],
    );
    assert.equal(readdirSync(web).length, 2);
  });

  it('runs one recording at a time and cancels cleanly', async () => {
    const long = (seconds) => recipe([{ do: 'wait', duration: seconds }]);
    const first = await (await post('/web/record', { projectId: 'p1', recipe: long(30) })).json();
    const second = await (await post('/web/record', { projectId: 'p1', recipe: long(0.3) })).json();
    for (let i = 0; i < 200 && getJob(first.jobId).progress < 3; i++) await sleep(25);
    assert.deepEqual(
      [getJob(first.jobId).status, getJob(second.jobId).status],
      ['running', 'queued'],
    );
    assert.equal((await fetch(`${base}/jobs/${first.jobId}`, { method: 'DELETE' })).status, 204);
    assert.equal(getJob(first.jobId).status, 'cancelled');
    const done = await finished(second.jobId);
    assert.equal(done.status, 'complete', 'the next one in the lane runs');
    assert.equal(
      readdirSync(web).filter((name) => !name.endsWith('.mp4') && !name.endsWith('.json')).length,
      0,
    );
    assert.equal(readdirSync(web).length, 4, 'two recordings in all: nothing of the cancelled one');
    assert.deepEqual(kit.leftovers(), { processes: [], profiles: [] });
  });

  it('takes a snapshot after some of the steps', async () => {
    const steps = [
      { do: 'click', target: '#toggle', duration: 0.2, hold: 0.2 },
      { do: 'click', target: 'text=Open the dialog', duration: 0.2, hold: 0.2 },
      { do: 'click' },
    ];
    const shot = async (until) => {
      // At the clip's own scale and frame rate; the picture comes back at one pixel per pixel.
      const body = { recipe: recipe(steps, { scale: 3 }), until, fps: 25 };
      const answer = await post('/web/snapshot', body);
      assert.equal(answer.status, 200, await answer.clone().text());
      const snapshot = await answer.json();
      const file = join(kit.SCRATCH, `shot-${until}.png`);
      writeFileSync(
        file,
        Buffer.from(snapshot.image.replace('data:image/png;base64,', ''), 'base64'),
      );
      return { ...snapshot, pixels: await readFrames(file, 640, 360) };
    };
    const start = await shot(0);
    assert.deepEqual(Object.keys(start).slice(0, 8), [
      'url',
      'title',
      'viewport',
      'page',
      'scrollY',
      'image',
      'elements',
      'warnings',
    ]);
    assert.deepEqual(
      [start.url, start.title, start.scrollY],
      [`${site.url}/`, 'NearEdit test site', 0],
    );
    assert.deepEqual(
      [start.viewport, start.page],
      [
        { width: 640, height: 360 },
        { width: 640, height: 1400 },
      ],
    );
    assert.equal(start.pixels.count, 1, 'one picture, 640 × 360 whatever the scale of the recipe');
    assert.ok(kit.near(start.pixels.at(0, 260, 140), [0, 0, 0]), 'the lamp is dark');
    const names = (snapshot) => snapshot.elements.map((element) => element.name);
    assert.deepEqual(names(start), [
      'Hover over me',
      'Switch the lamp',
      'Second page',
      'Open the dialog',
      'Far away',
    ]);
    assert.deepEqual(start.elements[4], {
      ...{ kind: 'button', name: 'Far away', target: 'text=Far away' },
      ...{ rect: { x: 300, y: 1200, width: 160, height: 40 }, visible: false },
    });
    const one = await shot(1);
    assert.ok(
      kit.near(one.pixels.at(0, 260, 140), [255, 255, 0]),
      'after the first step it is lit',
    );
    // During the recording the hand's palm covers this spot, just under the button's words.
    assert.ok(
      kit.near(one.pixels.at(0, 124, 153), [221, 221, 221]),
      `and the pointer is not in the picture: ${one.pixels.at(0, 124, 153)}`,
    );
    const two = await shot(2);
    assert.ok(names(two).includes('Close it'), 'after the second the dialog is open');
    const whole = await post('/web/snapshot', { recipe: recipe(steps) });
    assert.equal(whole.status, 422, 'all steps are played by default, so all must be complete');
    assert.deepEqual(Object.keys((await whole.json()).fields), ['steps[2].target']);
    const refused = await post('/web/snapshot', { recipe: { url: `${site.other.url}/` } });
    assert.equal(refused.status, 403);
    assert.match((await refused.json()).error, /was refused: 127\.0\.0\.1 is a private address/);
    assert.equal((await post('/web/snapshot', { recipe: recipe(), until: -1 })).status, 422);
    assert.equal((await post('/web/snapshot', { recipe: recipe(), fps: 500 })).status, 422);
  });
});
