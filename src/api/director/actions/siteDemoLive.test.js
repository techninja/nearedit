import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import express from 'express';
import { applyDirectorResult } from '#utils/edl/apply.js';
import { createEdl } from '#utils/edl/factory.js';
import { validateEdl } from '#utils/edl/validate.js';
import { isStale, zoomView } from '#utils/web/index.js';
import * as kit from '../../../../tests/web/kit.js';
import { directorRouter } from '../../director.js';
import { cancelJob, getJob } from '../../lib/jobs.js';
import { createProject } from '../testing/fixtures.js';
import { checkResult } from '../testing/invariants.js';
import { startDemoSite } from '../web/testing/site.js';

/**
 * The action through its route, with the real recorder, on the test site:
 * what is recorded is a real page in a real (headless) browser. Skipped,
 * saying why, on a machine without chrome-headless-shell.
 */

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

describe('site_demo with the real recorder', { skip: kit.SKIP }, () => {
  let site;
  let project;
  let server;
  let base;
  const web = () => join(project.dir, '.nearedit', 'web');
  const post = async (directive, more = {}) => {
    const body = {
      projectId: project.projectId,
      adaptationId: project.adaptationId,
      directive,
      ...more,
    };
    const res = await fetch(`${base}/director`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { status: res.status, body: await res.json() };
  };
  const demo = (directive) =>
    post({
      action: 'site_demo',
      ...directive,
      params: { url: `${site.url}/`, theme: 'auto', ...directive.params },
    });
  const finished = async (jobId) => {
    for (let i = 0; i < 2400; i++) {
      const job = getJob(jobId);
      if (['complete', 'error', 'cancelled'].includes(job.status)) return job;
      await sleep(25);
    }
    throw new Error('job did not finish');
  };

  before(async () => {
    site = await startDemoSite();
    project = await createProject({}, { resolution: '1280x720' });
    process.env.WEB_CAPTURE_ALLOW = site.allow;
    process.env.LLM_PROVIDER = 'none';
    const app = express();
    app.use(express.json({ limit: '10mb' }));
    app.use('/api', directorRouter);
    await new Promise((resolve) => (server = app.listen(0, '127.0.0.1', resolve)));
    base = `http://127.0.0.1:${server.address().port}/api`;
  });
  after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await site.close();
    assert.deepEqual(kit.leftovers(), { processes: [], profiles: [] }, 'nothing is left running');
    kit.cleanup();
  });

  it('refuses a missing or private address before a job exists', async () => {
    const none = await post({ action: 'site_demo', prompt: 'click Pricing' });
    assert.equal(none.status, 422);
    assert.deepEqual(none.body.fields, { 'params.url': 'The address is missing' });
    const words = await post({ action: 'site_demo', params: { url: 'ftp://example.com' } });
    assert.deepEqual(
      [words.status, words.body.fields['params.url']],
      [422, 'Must start with http:// or https://'],
    );
    const closed = await post({ action: 'site_demo', params: { url: 'http://127.0.0.1:9/' } });
    assert.equal(closed.status, 422);
    assert.match(
      closed.body.error,
      /^http:\/\/127\.0\.0\.1:9\/ was refused: 127\.0\.0\.1 is a private address \(loopback\)\. To record it anyway, allow it: WEB_CAPTURE_ALLOW=127\.0\.0\.1:9$/,
    );
    assert.equal(site.hits.length, 0, 'and nothing was opened');
  });

  it('records a brief on the real page and frames it', async () => {
    const brief =
      'click Yearly | Two months free\ntype hello@example.com into Email\nzoom in on the Pro plan';
    const { status, body } = await demo({ prompt: brief, params: { pacing: 'fast' } });
    assert.equal(status, 202, JSON.stringify(body));
    const job = await finished(body.jobId);
    assert.equal(job.status, 'complete', job.error);
    assert.deepEqual(
      [job.type, job.label],
      ['director', 'Site demo: click Yearly | Two months free type hello@example.com into E'],
    );
    const result = job.result;
    assert.deepEqual(checkResult(result, { fps: 30, roots: [project.dir] }), []);
    const empty = createEdl({ fps: 30, resolution: '1280x720' });
    assert.deepEqual(validateEdl(applyDirectorResult(empty, result)).problems, []);
    // The recording and its track are in the project, where the editor looks for them.
    const [page] = result.tracks.find((track) => track.name === 'Page').clips;
    assert.deepEqual(readdirSync(web()).sort(), [`${page.web.key}.json`, `${page.web.key}.mp4`]);
    assert.ok(page.sourceFile === join(web(), `${page.web.key}.mp4`) && !isStale(page, 30));
    assert.equal(page.web.title, 'Tideline — changelogs people read');
    assert.ok(site.hits.filter((path) => path === '/').length >= 2, 'looked at, then recorded');
    // Every stop found its target on the real page, where the snapshot said it would be.
    assert.deepEqual(
      result.plan.stops.map((stop) => [stop.target, stop.found]),
      [
        ['text=Yearly', true],
        ['label=Email', true],
        ['article[aria-label="Pro plan"]', true],
      ],
    );
    assert.ok(
      !result.notes.some((note) => /^The recorder says/.test(note)),
      result.notes.join('\n'),
    );
    // The camera goes close to all three, and what it goes close to was brought to the middle.
    const scales = page.keyframes['transform.scaleX'];
    assert.ok(Math.max(...scales.map((key) => key.v)) > page.transform.scaleX * 1.4);
    assert.match(
      result.summary,
      /^Site demo of 127\.0\.0\.1:\d+: 3 stops, .* — window look, \w+, 1 caption, 3 zooms$/,
    );
    assert.match(
      result.notes.join('\n'),
      /auto: a dark ground for a light page, the closest to its own colour/,
    );
    assert.ok(job.log.some((line) => /^recording frame \d+ of \d+$/.test(line)));
    const again = await finished(
      (await demo({ prompt: brief, params: { pacing: 'fast' } })).body.jobId,
    );
    assert.match(again.result.notes.join('\n'), /had been recorded before/);
    assert.equal(readdirSync(web()).length, 2);
    // What the stand-in recorder assumes holds on the real page: targets end up in the middle.
    const track = JSON.parse(
      await (
        await import('node:fs/promises')
      ).readFile(join(web(), `${page.web.key}.json`), 'utf8'),
    );
    const view = zoomView(track, { width: 1280, height: 720 });
    const typed = track.steps.find((step) => step.do === 'type');
    const middle = (typed.rect.y + typed.rect.height / 2) / view.vh;
    assert.ok(middle > 0.25 && middle < 0.75, `the field was typed into at ${middle} of the view`);
  });

  it('tours a page it was told nothing about, in a tall frame that the page fills', async () => {
    const tall = createEdl({ fps: 30, resolution: '720x1280' });
    const { status, body } = await post(
      {
        action: 'site_demo',
        params: { url: `${site.url}/`, theme: 'auto', look: 'full', pacing: 'fast', duration: 9 },
      },
      { edl: tall },
    );
    assert.equal(status, 202, JSON.stringify(body));
    const job = await finished(body.jobId);
    assert.equal(job.status, 'complete', job.error);
    const [page] = job.result.tracks.find((track) => track.name === 'Page').clips;
    assert.deepEqual(page.web.recipe.viewport, { width: 390, height: 694 });
    assert.equal(job.result.duration, 9);
    assert.match(
      job.result.notes[0],
      /^No brief: a tour of the page — \d of its \d sections below the opening view/,
    );
    assert.ok(
      job.result.plan.stops.every((stop) => stop.found),
      JSON.stringify(job.result.plan.stops),
    );
    assert.deepEqual(validateEdl(applyDirectorResult(tall, job.result)).problems, []);
  });

  it('fails the job in the recorder’s words when the page cannot be loaded', async () => {
    process.env.WEB_CAPTURE_ALLOW = `${site.allow},127.0.0.1:9`;
    const { status, body } = await post({
      action: 'site_demo',
      params: { url: 'http://127.0.0.1:9/' },
    });
    process.env.WEB_CAPTURE_ALLOW = site.allow;
    assert.equal(status, 202);
    const job = await finished(body.jobId);
    assert.equal(job.status, 'error');
    assert.match(job.error, /^http:\/\/127\.0\.0\.1:9\/ could not be loaded/);
  });

  it('stops the browser and leaves no file when the job is cancelled mid-recording', async () => {
    const before = readdirSync(web());
    const { body } = await demo({ prompt: 'wait 40\nclick Pricing' });
    for (
      let i = 0;
      i < 1200 && !getJob(body.jobId).log.some((line) => /^recording frame/.test(line));
      i++
    )
      await sleep(25);
    assert.ok(kit.leftovers().processes.length > 0, 'a browser is recording');
    cancelJob(body.jobId);
    assert.equal(getJob(body.jobId).status, 'cancelled');
    for (let i = 0; i < 400 && kit.leftovers().processes.length; i++) await sleep(25);
    assert.deepEqual(kit.leftovers(), { processes: [], profiles: [] });
    assert.deepEqual(readdirSync(web()), before, 'no recording, whole or partial');
    assert.ok(existsSync(web()));
  });
});
