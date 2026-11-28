/**
 * Renders never miss music: a timeline's music clips are pointed at the
 * rendering of their song, and what is missing or stale is rendered into
 * the project before the render (and `/render/plan`) reads anything — the
 * finished file has that sound in it.
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { normalizeEdl } from '../../src/utils/edl/normalize.js';
import { encodeWav, renderSong, songKey } from '../../src/utils/music/index.js';
import { cancelJob, getJob } from '../../src/api/lib/jobs.js';
import * as music from '../../src/api/music/index.js';
import { renderRouter } from '../../src/api/render.js';
import { prepareRender } from '../../src/api/render/prepare.js';
import { readAudio } from '../../src/api/render/testkit.js';
import * as kit from './serverKit.js';

const { KICK_HAT, heavy, sleep } = kit;

describe('music in a render', () => {
  let box;
  let api;
  const post = (path, body) => kit.call(api.url, 'POST', `/api/${path}`, body);
  const clip = (song, more = {}) => ({ timelineStart: 0, music: { song }, ...more });
  const edl = (...tracks) => ({
    fps: 30,
    resolution: '320x180',
    tracks: tracks.map((track) => (Array.isArray(track) ? { type: 'audio', clips: track } : track)),
  });
  const rendered = (folder, song) => join(folder, '.nearedit', 'music', `${songKey(song)}.wav`);
  const finished = async (jobId) => {
    for (let i = 0; i < 1200; i++) {
      const job = getJob(jobId);
      if (['complete', 'error', 'cancelled'].includes(job.status)) return job;
      await sleep(25);
    }
    throw new Error('job did not finish');
  };
  /** The sound files a plan reads. */
  const sounds = (plan) =>
    plan.inputs.filter((input) => input.kind === 'audio').map((input) => input.file);

  before(async () => {
    box = kit.musicSandbox('music-timeline');
    api = await kit.serve(renderRouter);
  });
  after(async () => {
    await api.close();
    assert.ok(await kit.idle(), 'no worker thread outlives the tests');
    assert.deepEqual([kit.debris(box.project), kit.debris(box.data)], [[], []]);
    box.cleanup();
  });

  it('renders an unrendered music clip first, and the render has its sound', async () => {
    const started = await post('render', { projectId: 'p1', edl: edl([clip(KICK_HAT)]) });
    assert.equal(started.status, 202, started.text);
    const job = await finished(started.body.jobId);
    assert.equal(job.status, 'complete', job.error);
    assert.ok(job.log.includes('Rendering music: 1 song'), job.log.join(' | '));
    assert.equal(job.result.duration, 5);
    // The rendering is in the project, and is the engine's.
    const file = rendered(box.project, KICK_HAT);
    assert.ok(readFileSync(file).equals(Buffer.from(encodeWav(renderSong(KICK_HAT)))));
    // The finished file, decoded: the kick where the kick is, the hat where the hat is,
    // and silence where the song is silent.
    const { left, right } = await readAudio(job.result.output);
    const heard = {
      kick: [kit.level(left, 0, 0.2), kit.brightness(left, 0.02, 0.2)],
      hat: [kit.level(left, 2, 2.06), kit.brightness(left, 2, 2.06)],
      between: kit.level(left, 0.8, 1.95) + kit.level(right, 0.8, 1.95),
      after: kit.level(left, 2.5, 4.95) + kit.level(right, 2.5, 4.95),
    };
    console.log(`    heard in the render: ${JSON.stringify(heard)}`);
    assert.ok(heard.kick[0] > 0.1 && heard.kick[1] < 250, 'a low thump at the start');
    assert.ok(heard.hat[0] > 0.004 && heard.hat[1] > 3000, 'a bright tick at two seconds');
    assert.ok(heard.between < 0.001 && heard.after < 0.001, 'and nothing else');
  });

  it('renders for a plan too, and plays a rendering that is already there', async () => {
    const song = { ...KICK_HAT, bpm: 100 };
    const body = { projectId: 'p1', edl: edl([clip(song)]) };
    assert.equal(existsSync(rendered(box.project, song)), false);
    const plan = await post('render/plan', body);
    assert.equal(plan.status, 200, plan.text);
    assert.deepEqual(sounds(plan.body), [rendered(box.project, song)]);
    assert.ok(music.readMusic(box.project, songKey(song)), 'made by the plan');
    const { most, result } = await kit.watched(() => post('render/plan', body));
    assert.deepEqual([most, sounds(result.body)], [0, [rendered(box.project, song)]]);
  });

  it('goes by the song, whatever file and key the document names', async () => {
    // Never rendered here, said to be rendered elsewhere: outside every allowed folder.
    const moved = clip(
      { ...KICK_HAT, bpm: 101 },
      { sourceFile: join(box.outside, 'gone.wav'), placeholder: false },
    );
    moved.music.key = '0123456789abcdef0123';
    // Stale: it still points at the rendering of the song it was before.
    const old = rendered(box.project, KICK_HAT);
    const stale = clip({ ...KICK_HAT, bpm: 102 }, { sourceFile: old, timelineStart: 10 });
    stale.music.key = songKey(KICK_HAT);
    const plan = await post('render/plan', { projectId: 'p1', edl: edl([moved, stale]) });
    assert.equal(plan.status, 200, plan.text);
    assert.deepEqual(
      sounds(plan.body),
      [moved, stale].map((one) => rendered(box.project, one.music.song)),
    );
    assert.ok(sounds(plan.body).every((file) => existsSync(file)));
  });

  it('renders into the data folder for a timeline without a project', async () => {
    const song = { ...KICK_HAT, bpm: 103 };
    const plan = await post('render/plan', { edl: edl([clip(song)]) });
    assert.equal(plan.status, 200, plan.text);
    assert.deepEqual(sounds(plan.body), [rendered(box.data, song)]);
    assert.ok(music.readMusic(box.data, songKey(song)));
    assert.equal(existsSync(rendered(box.project, song)), false);
  });

  it('renders what the render plays: a locked track, not a muted one', async () => {
    const [quiet, kept] = [{ bpm: 104 }, { ...KICK_HAT, bpm: 105 }];
    const tracks = [
      { type: 'audio', muted: true, clips: [clip(quiet)] },
      { type: 'audio', locked: true, clips: [clip(kept)] },
    ];
    const plan = await post('render/plan', { projectId: 'p1', edl: edl(...tracks) });
    assert.equal(plan.status, 200, plan.text);
    assert.deepEqual(sounds(plan.body), [rendered(box.project, kept)]);
    assert.equal(existsSync(rendered(box.project, quiet)), false);
    // Music on a muted track alone is nothing to render, like any clip there.
    const empty = await post('render/plan', { projectId: 'p1', edl: edl(tracks[0]) });
    assert.deepEqual(
      [empty.status, empty.body.error],
      [422, 'Timeline is empty: there is nothing to render'],
    );
  });

  it('stops rendering music when the render job is cancelled', async () => {
    const song = heavy(8, 106);
    const started = await post('render', { projectId: 'p1', edl: edl([clip(song)]) });
    for (let i = 0; i < 2000 && !music.activeMusicRenders(); i++) await sleep(2);
    assert.equal(music.activeMusicRenders(), 1);
    cancelJob(started.body.jobId);
    assert.equal((await finished(started.body.jobId)).status, 'cancelled');
    assert.ok(await kit.idle(2000));
    assert.equal(existsSync(rendered(box.project, song)), false);
  });

  it(
    'fails the render with the reason when a song cannot be rendered',
    { skip: process.platform !== 'linux' },
    async () => {
      // A clip that points at the rendering of its song in a folder nothing can be made in.
      const { edl: doc } = music.attachMusic(normalizeEdl(edl([clip({ bpm: 107 })])), [
        '/sys/kernel',
      ]);
      await assert.rejects(prepareRender(doc), (err) => {
        assert.deepEqual([err.name, err.status], ['RenderError', 403]);
        assert.match(
          err.message,
          /^Music cannot be rendered into \/sys\/kernel\/\.nearedit\/music/,
        );
        return true;
      });
    },
  );

  it('attaches renderings: found in any folder, missing ones named or left placeholders', () => {
    const [here, there] = [KICK_HAT, { ...KICK_HAT, bpm: 103 }];
    const absent = { bpm: 108 };
    const doc = normalizeEdl(
      edl(
        [clip(here), clip(absent, { timelineStart: 20 }), clip(absent, { timelineStart: 40 })],
        [clip(there)],
      ),
    );
    const folders = [box.project, box.data];
    const served = music.attachMusic(doc, folders);
    const clips = served.edl.tracks.flatMap((track) => track.clips).filter((one) => one.music);
    const missing = rendered(box.project, absent);
    assert.deepEqual(
      clips.map((one) => [one.sourceFile, one.placeholder, one.music.key]),
      [
        [rendered(box.project, here), false, songKey(here)],
        [missing, false, songKey(absent)],
        [missing, false, songKey(absent)],
        [rendered(box.data, there), false, songKey(there)],
      ],
    );
    assert.deepEqual(
      served.missing.map((one) => [one.key, one.file, one.clipId]),
      [clips[1], clips[2]].map((one) => [songKey(absent), missing, one.clipId]),
    );
    assert.deepEqual(served.missing[0].song, clips[1].music.song);
    // The command line renders before it loads again: a missing one stays a placeholder.
    const waiting = music.attachMusic(doc, folders, { placeholders: true });
    const left = waiting.edl.tracks.flatMap((track) => track.clips).filter((one) => one.music);
    assert.deepEqual(
      left.map((one) => [one.sourceFile, one.placeholder]),
      [
        [rendered(box.project, here), false],
        ['', true],
        ['', true],
        [rendered(box.data, there), false],
      ],
    );
    assert.equal(waiting.missing.length, 2);
    assert.equal(music.musicFolder(missing, songKey(absent)), box.project);
    assert.equal(
      music.musicFolder(join(box.project, 'music', `${songKey(absent)}.wav`), songKey(absent)),
      null,
    );
  });
});
