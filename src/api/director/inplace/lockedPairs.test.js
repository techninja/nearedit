import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { applyDirected } from '#utils/director/applyResult.js';
import { applyDirectorResult, captionedClips, validateEdl } from '#utils/edl/index.js';
import { insertBroll } from '../actions/insertBroll.js';
import { score } from '../actions/score.js';
import { fakeRenderer } from '../score/testing/renderer.js';
import { makeContext } from '../testing/context.js';
import { checkResult } from '../testing/invariants.js';
import { createParkProject } from '../testing/park.js';
import { clip, doc, pair, title } from '../testing/timeline.js';
import { addCaptions } from './addCaptions.js';
import { beatSync } from './beatSync.js';
import { applyBrand } from './brand.js';
import { removeSilence } from './removeSilence.js';

let park;
let P;
before(async () => {
  park = await createParkProject();
  P = park.paths;
});
after(() => park?.cleanup());

/** Every action that rewrites the posted timeline and returns the whole of it. */
const ACTIONS = {
  remove_silence: [removeSilence, {}],
  beat_sync: [beatSync, {}],
  'add_captions as words': [addCaptions, {}],
  'add_captions as phrases': [addCaptions, { params: { as: 'phrases' } }],
  score: [(ctx) => score(ctx, fakeRenderer()), { params: { style: 'auto', key: 'auto' } }],
  brand: [applyBrand, { params: { title: 'Park day' } }],
  'insert_broll over the picture': [
    insertBroll,
    { prompt: 'city traffic', params: { placement: 'overlay' }, context: { playheadPosition: 3 } },
  ],
};
const action = (name) => name.split(' ')[0];

/**
 * An interview and a beach shot, each a linked picture and sound, under a
 * title and over music — with the picture track or the sound track locked.
 * @param {'picture'|'sound'|''} locked
 */
function timeline(locked) {
  const [video, audio] = pair(P['interview.mp4'], 0, 16, 0);
  const [beach, beachSound] = pair(P['broll/beach.mp4'], 0.3, 4.3, 16);
  const edl = doc({
    video: [[title('Hello', 10, 12)], [video, beach]],
    audio: [[audio, beachSound], [clip(P['music/bed.wav'], 0, 20, 0, { intent: 'music' })]],
  });
  const index = { picture: 1, sound: 2 }[locked];
  if (index) edl.tracks[index] = { ...edl.tracks[index], locked: true };
  return {
    edl,
    index,
    interview: [video.clipId, audio.clipId],
    beach: [beach.clipId, beachSound.clipId],
  };
}
/** Run an action and put its result on the timeline the way the panel does. */
async function applied(name, edl, directive = {}) {
  const [run, base] = ACTIONS[name];
  const ctx = await makeContext(park, { action: action(name), ...base, ...directive }, { edl });
  const result = await run(ctx);
  const out = applyDirected(edl, result);
  assert.deepEqual(validateEdl(out).problems, [], name);
  return { result, out };
}
const clips = (edl) => new Map(edl.tracks.flatMap((t) => t.clips).map((c) => [c.clipId, c]));
/** `[a → b, b → a]` as the document has them; `undefined` for a clip that is gone. */
const linksOf = (edl, [a, b]) => [clips(edl).get(a)?.linkedClipId, clips(edl).get(b)?.linkedClipId];

for (const locked of ['picture', 'sound']) {
  test(`a pair with its ${locked} on a locked track stays a pair through every in-place action`, async () => {
    for (const name of Object.keys(ACTIONS)) {
      const made = timeline(locked);
      const { edl, interview, beach } = made;
      if (name === 'beat_sync' && locked === 'picture') {
        // Its picture track is the locked one: there is nothing it may move.
        await assert.rejects(applied(name, edl), /There are no picture clips to sync/);
        continue;
      }
      const { result, out } = await applied(name, edl);
      // The result is sound: its clips name their partners on the locked track, which —
      // like every locked track — travels empty. Without the document that looks broken.
      assert.deepEqual(checkResult(result, { fps: 30, roots: [park.dir], edl }), [], name);
      assert.match(
        checkResult(result, { fps: 30, roots: [park.dir] }).join(' '),
        /not in the fragment/,
      );
      const sent = result.tracks.filter((track) => track.locked);
      assert.deepEqual(
        sent.map((track) => track.clips),
        [[]],
        `${name}: locked tracks travel empty`,
      );
      // Nothing is lost or doubled, and what was not cut is still linked — both ways.
      const [before, now] = [clips(edl), clips(out)];
      for (const id of before.keys()) assert.ok(now.has(id), `${name}: ${id} is still there`);
      assert.deepEqual(linksOf(out, beach), [beach[1], beach[0]], `${name}: the beach pair`);
      const lockedTrack = out.tracks.find(
        (track) => track.trackId === edl.tracks[made.index].trackId,
      );
      if (name !== 'remove_silence') {
        assert.deepEqual(
          linksOf(out, interview),
          [interview[1], interview[0]],
          `${name}: the interview`,
        );
        assert.equal(
          lockedTrack,
          edl.tracks[made.index],
          `${name}: the locked track is the very same`,
        );
        continue;
      }
      // Removing pauses cuts the unlocked half into pieces its partner cannot follow: that
      // link is let go, on both sides, and the result says the track may be out of step.
      assert.deepEqual(linksOf(out, interview), ['', ''], 'the interview was cut');
      assert.match(
        result.notes.join(' '),
        /is locked: it was not closed up and may be out of sync/,
      );
      const unlinked = edl.tracks[made.index].clips.map((c) =>
        interview.includes(c.clipId) ? { ...c, linkedClipId: '' } : c,
      );
      assert.deepEqual(lockedTrack.clips, unlinked, 'nothing else changed on the locked track');
    }
  });
}

test('an action that finds nothing to change leaves the very document, links and all', async () => {
  const { edl, interview, beach } = timeline('sound');
  // The merge keeps both links (it once let them go, as its only change).
  const idle = await applied('beat_sync', edl);
  assert.match(idle.result.summary, /^Moved 0 of /);
  assert.deepEqual(linksOf(applyDirectorResult(edl, idle.result), interview), [
    interview[1],
    interview[0],
  ]);
  assert.equal(idle.out, edl);
  const quiet = await applied('remove_silence', edl, { context: { selection: [beach[0]] } });
  assert.match(quiet.result.summary, /nothing changed$/);
  assert.equal(quiet.out, edl);
  // Done once, an action has nothing more to do: the second result is no change at all.
  for (const name of ['add_captions as words', 'brand']) {
    const first = await applied(name, timeline('picture').edl);
    const again = await applied(name, first.out);
    assert.equal(again.out, first.out, name);
  }
  assert.deepEqual(linksOf(edl, beach), [beach[1], beach[0]]);
});

test('the invariant still catches a link that leads nowhere', async () => {
  const { edl, interview } = timeline('sound');
  const { result } = await applied('add_captions as phrases', edl);
  const opts = { fps: 30, roots: [park.dir], edl };
  const picture = result.tracks
    .flatMap((track) => track.clips)
    .find((c) => c.clipId === interview[0]);
  picture.linkedClipId = 'clip_nowhere';
  assert.match(checkResult(result, opts).join(' '), /linked clip clip_nowhere not in the fragment/);
  // A clip on a locked track that is linked to something else is not its partner.
  picture.linkedClipId = edl.tracks[2].clips[1].clipId;
  assert.match(checkResult(result, opts).join(' '), /on a locked track is not linked to it/);
  // And a clip of a locked track never travels.
  picture.linkedClipId = interview[1];
  result.tracks.find((track) => track.locked).clips.push(structuredClone(edl.tracks[2].clips[0]));
  assert.match(checkResult(result, opts).join(' '), /a clip of a locked track was sent/);
});

test('add_captions counts only the voices it could switch on: a pair with a locked half is not one', async () => {
  const captioned = (edl) =>
    captionedClips(edl).map(({ clip: c }) => c.sourceFile.split('/').pop());
  for (const index of [0, 1]) {
    const [picture, sound] = pair(P['interview.mp4'], 1, 5, 0);
    const edl = doc({ video: [[picture]], audio: [[sound], [clip(P['voice.wav'], 0.4, 2.4, 6)]] });
    edl.tracks[index] = { ...edl.tracks[index], locked: true };
    const { result, out } = await applied('add_captions as words', edl);
    assert.equal(result.summary, 'Captions switched on for 1 clip (Clean, from the brand kit)');
    assert.deepEqual(captioned(out), ['voice.wav']);
    assert.match(
      result.notes.join(' '),
      /interview\.mp4 is on a locked track, or linked to a clip on one — its captions were not switched on\./,
    );
    // The pair is as it was, and still a pair.
    assert.equal(out.tracks[index], edl.tracks[index]);
    assert.deepEqual(out.tracks[1 - index].clips, edl.tracks[1 - index].clips);
    assert.deepEqual(linksOf(out, [picture.clipId, sound.clipId]), [sound.clipId, picture.clipId]);
    // With nothing else to caption nothing is said to be switched on, and nothing changes.
    const only = { ...edl, tracks: edl.tracks.slice(0, 2) };
    const none = await applied('add_captions as words', only);
    assert.equal(
      none.result.summary,
      'No captions switched on — the speech with a transcript is on locked tracks',
    );
    assert.equal(none.out, only);
  }
});
