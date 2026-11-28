import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import express from 'express';
import { applyDirected } from '#utils/director/applyResult.js';
import { ACTIONS } from '#utils/director/actions.js';
import { createEdl, elementClips, validateEdl } from '#utils/edl/index.js';
import { FONT_DIR } from '../../compose/index.js';
import { directorRouter } from '../../director.js';
import { PNG } from '../../kits/testkit.js';
import { getJob } from '../../lib/jobs.js';
import { readProject, writeProject } from '../../lib/registry.js';
import { createParkProject } from '../testing/park.js';
import { clip, doc, pair } from '../testing/timeline.js';

// A project that uses a library kit with its own colours, a font file and a logo.
let park;
let server;
let base;
let kitDir;
before(async () => {
  park = await createParkProject();
  delete process.env.NEAREDIT_KITS_DIR;
  process.env.LLM_PROVIDER = 'none';
  kitDir = join(process.env.NEAREDIT_DATA_DIR, 'kits', 'acme');
  mkdirSync(kitDir, { recursive: true });
  // A real font file under a family of the kit's own.
  copyFileSync(
    join(FONT_DIR, 'bebas-neue/bebas-neue-latin-400-normal.woff2'),
    join(kitDir, 'Acme.woff2'),
  );
  writeFileSync(join(kitDir, 'logo.png'), PNG);
  const kit = {
    ...{ name: 'Acme', extends: 'builtin:clean' },
    tokens: {
      color: { background: '#07102a', primary: '#ff6b2c' },
      font: { heading: { family: 'Acme Sans', weight: 700 } },
      logo: { mark: 'logo.png' },
      sound: { style: 'synthwave', key: 'A', scale: 'minor' },
      caption: { preset: 'boxed' },
    },
    fonts: [{ family: 'Acme Sans', weight: 700, file: 'Acme.woff2' }],
  };
  writeFileSync(join(kitDir, 'kit.json'), JSON.stringify(kit));
  writeProject(park.projectId, { ...readProject(park.projectId), kit: 'acme' });
  const app = express();
  app.use(express.json({ limit: '10mb' }));
  app.use('/api', directorRouter);
  await new Promise((resolve) => (server = app.listen(0, '127.0.0.1', resolve)));
  base = `http://127.0.0.1:${server.address().port}/api`;
});
after(async () => {
  await new Promise((resolve) => server.close(resolve));
  park.cleanup();
});

/** Run a directive through the route and wait for its job. */
async function direct(directive, edl) {
  const res = await fetch(`${base}/director`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      projectId: park.projectId,
      adaptationId: park.adaptationId,
      directive,
      edl,
    }),
  });
  const body = await res.json();
  assert.equal(res.status, 202, JSON.stringify(body));
  for (let i = 0; i < 800; i++) {
    const job = getJob(body.jobId);
    if (job.status === 'complete') return job.result;
    assert.ok(!['error', 'cancelled'].includes(job.status), job.error);
    await new Promise((resolve) => setTimeout(resolve, 15));
  }
  throw new Error('job did not finish');
}
function talk() {
  const [video, audio] = pair(park.paths['interview.mp4'], 0, 8, 0);
  return doc({
    video: [[video, clip(park.paths['broll/city.mp4'], 1, 5, 8)]],
    audio: [[audio]],
  });
}

test('the actions are served: the brand pass, and which actions follow the brand', async () => {
  const { data } = await (await fetch(`${base}/director/actions`)).json();
  assert.deepEqual(data, JSON.parse(JSON.stringify(ACTIONS)));
  assert.equal(data.at(-1).id, 'brand');
  assert.deepEqual(
    data.filter((action) => action.brand).map((action) => action.id),
    [
      ...['base_edit', 'generate_edit', 'execute_script', 'motion_piece'],
      ...['site_demo', 'score', 'brand'],
    ],
  );
});

test('a job works in the project’s kit: the motion piece wears it, files and all', async () => {
  const result = await direct({ action: 'motion_piece', prompt: 'Hello there\nGoodbye' });
  assert.equal(result.plan.theme, 'brand');
  assert.match(result.summary, /^Motion piece “Acme”/);
  const font = {
    family: 'Acme Sans',
    weight: 700,
    style: 'normal',
    file: join(kitDir, 'Acme.woff2'),
  };
  assert.deepEqual(result.document, { fonts: [font] });
  const merged = applyDirected(createEdl(), result);
  assert.deepEqual(validateEdl(merged).problems, []);
  const [intro] = elementClips(merged).map(({ clip: c }) => c);
  assert.deepEqual([intro.element.id, intro.element.kit.id], ['intro', 'acme']);
  assert.match(JSON.stringify(intro.element.design), new RegExp(join(kitDir, 'logo.png')));
  const title = merged.tracks.flatMap((t) => t.clips).find((c) => c.text.content === 'Goodbye');
  assert.equal(title.text.fontFamily, 'Acme Sans');
  assert.deepEqual(merged.fonts, [font]);
});

test('the score and the brand pass over HTTP: the kit’s sound, its elements, and no doubles', async () => {
  const scored = await direct({ action: 'score', params: { seed: 2 } }, talk());
  assert.deepEqual(
    [scored.plan.style, scored.plan.key, scored.plan.scale],
    ['synthwave', 'A', 'minor'],
  );
  const directive = { action: 'brand', params: { speakers: 'Ada Lovelace — Park ranger' } };
  const edl = talk();
  const passed = await direct(directive, edl);
  assert.match(
    passed.summary,
    /^Brand “Acme”: placed intro, outro, logo bug and lower third; caption style Boxed$/,
  );
  assert.equal(passed.plan.title, 'Director test');
  const out = applyDirected(edl, passed);
  assert.deepEqual(validateEdl(out).problems, []);
  assert.equal(out.captions.style.font.family, 'Acme Sans');
  assert.deepEqual(
    out.fonts.map((face) => face.file),
    [join(kitDir, 'Acme.woff2')],
  );
  assert.ok(elementClips(out).every(({ clip: c }) => c.element.kit.id === 'acme'));
  const again = await direct(directive, out);
  assert.match(again.summary, /nothing to change — the timeline already carries it/);
  const strip = (value) => JSON.stringify(value, (key, v) => (key === 'markerId' ? '' : v));
  assert.equal(strip(applyDirected(out, again)), strip(out));
});

test('an adaptation that chose another kit works in that one', async () => {
  const project = readProject(park.projectId);
  project.adaptations[0].kit = 'builtin:bold';
  writeProject(park.projectId, project);
  const result = await direct({ action: 'motion_piece', prompt: 'Hello there\nGoodbye' });
  assert.match(result.summary, /^Motion piece “Bold”/);
  assert.equal(result.document, undefined);
});
