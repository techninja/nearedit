import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, rmSync } from 'node:fs';
import { getStyle } from '#utils/director/score/styles.js';
import { resolveClip } from '#utils/edl/animate.js';
import { applyDirectorResult } from '#utils/edl/apply.js';
import { musicClips } from '#utils/edl/musicClip.js';
import { validateEdl } from '#utils/edl/validate.js';
import { isStaleMusic, musicDuration } from '#utils/music/clip.js';
import { songKey } from '#utils/music/key.js';
import { validateSong } from '#utils/music/validate.js';
import { DirectorError } from '../errors.js';
import { fakeRenderer } from '../score/testing/renderer.js';
import { makeContext } from '../testing/context.js';
import { checkResult } from '../testing/invariants.js';
import { createParkProject } from '../testing/park.js';
import { clip, doc, pair, title } from '../testing/timeline.js';
import { score } from './score.js';

let park;
let P;
before(async () => {
  park = await createParkProject();
  P = park.paths;
});
after(() => park.cleanup());

/** The interview with a title over it, b-roll after it, one marker: 20 seconds, speech in three stretches. */
function talk(extra = {}) {
  const [video, audio] = pair(P['interview.mp4'], 0, 16, 0);
  return doc(
    {
      video: [[title('Hi', 10, 12)], [video, clip(P['broll/city.mp4'], 1, 5, 16)]],
      audio: [[audio]],
    },
    { markers: [{ markerId: 'm_1', time: 9.5, label: 'beach', color: '' }], ...extra },
  );
}
/** Run the action and merge its result into the document it was given. */
async function scored(edl, directive = {}, renderer = fakeRenderer(), extra = {}) {
  // This suite is about what the timeline and the form decide: it leaves the
  // brand's sound (the default; `scoreBrand.test.js`) unless a test asks for it.
  const params = { style: 'auto', key: 'auto', ...directive.params };
  const ctx = await makeContext(park, { action: 'score', ...directive, params }, { edl, ...extra });
  const result = await score(ctx, renderer);
  assert.deepEqual(checkResult(result, { fps: 30, roots: [park.dir] }), []);
  const out = applyDirectorResult(edl, result);
  assert.deepEqual(validateEdl(out).problems, []);
  const found = musicClips(out);
  assert.equal(found.length, 1, 'one music clip');
  return { result, out, music: found[0].clip, track: found[0].track, ctx, renderer };
}
const rest = (edl) => edl.tracks.map(({ name, trackId, clips }) => ({ name, trackId, clips }));

test('a score for a timeline with speech: one music clip on a new track, ducked, nothing else touched', async () => {
  const edl = talk();
  const { result, out, music, track, ctx } = await scored(edl);
  // The document as it was, plus one track at the bottom with one clip.
  assert.deepEqual(rest(out).slice(0, 3), rest(edl));
  assert.deepEqual(
    out.markers.map((marker) => [marker.time, marker.label]),
    [[9.5, 'beach']],
  );
  assert.equal(out.tracks.length, 4);
  assert.deepEqual([track.name, track.type, out.tracks[3] === track], ['Music', 'audio', true]);
  // The clip: the whole timeline, the song it was rendered from, the rendering it points at.
  assert.deepEqual(
    [music.timelineStart, music.timelineEnd, music.sourceIn, music.sourceOut],
    [0, 20, 0, 20],
  );
  assert.equal(music.music.key, songKey(music.music.song));
  assert.equal(isStaleMusic(music), false);
  assert.ok(music.sourceFile.endsWith(`/.nearedit/music/${music.music.key}.wav`));
  assert.ok(music.sourceFile.startsWith(park.dir) && existsSync(music.sourceFile));
  assert.deepEqual([music.intent, music.placeholder, music.volume], ['music', false, 0.7]);
  assert.equal(music.label, 'Score · Lo-fi in D dorian, 72 BPM');
  assert.ok(musicDuration(music) >= 23, 'the song rings on past the clip');
  assert.deepEqual(validateSong(music.music.song).problems, []);
  // 72 BPM makes the 20 s six bars of four: the music ends with the picture.
  const { song } = music.music;
  assert.deepEqual([song.bpm, song.bars, song.beatsPerBar], [72, 6, 4]);
  assert.equal((song.bars * song.beatsPerBar * 60) / song.bpm, 20);
  // Ducked under the three stretches of speech, twelve decibels, back up in the gaps.
  const at = (time) => resolveClip(music, time).volume;
  for (const t of [1, 3, 4.6, 7, 9.5, 11, 13.7]) assert.equal(at(t), 0.1758, `at ${t}s`);
  for (const t of [0, 0.5, 5.5, 10.2, 15, 19.9]) assert.equal(at(t), 0.7, `at ${t}s`);
  assert.equal(music.keyframes.volume.length, 12);
  assert.ok(music.fadeIn > 0 && music.fadeIn <= 0.5 && music.fadeOut >= 1 && music.fadeOut <= 3);
  assert.equal(
    result.summary,
    'Score: Lo-fi in D dorian, 72 BPM — 6 bars over 20s, 2 sections, ducked under speech in 3 places',
  );
  assert.deepEqual(result.notes, [
    'Style Lo-fi — a slow timeline (3 cuts a minute) with speech over 45% of it: a bed that leaves the voice room.',
    '72 BPM makes the 20s exactly 6 bars of 4 (Lo-fi plays at 70–90 BPM).',
    'Sections: intro 0:00 · lift 0:10 (title “Hi”).',
    '1 turning point of the timeline lies inside a section: too close to another one, or to an end, to begin its own.',
    'D dorian, i7 – v7 – IV7 – i7, ending on A7 – Dm. 10 parts: Kick and hats, Snare, Shaker, Fill, Keys, Sub, Dust, Bell, Keys cadence, Sub cadence.',
    'Speech was found from the transcript of 1 clip.',
    'The music drops by 12 dB under 3 stretches of speech (45% of the span) and comes back in the gaps: volume keyframes on the clip.',
    'The clip is on a new audio track, “Music”.',
    'It is an ordinary music clip: open it to change any note, or run again with another variation number for another take.',
  ]);
  assert.deepEqual(ctx.logs.slice(0, 2), [
    'Scoring 20s: the whole timeline',
    'Rendering Lo-fi in D dorian, 72 BPM…',
  ]);
  assert.match(ctx.logs.at(-1), /^Rendering the music… 100%$/);
});

test('the plan of the result says what was decided, section by section', async () => {
  const { result } = await scored(talk(), { prompt: 'calm, hopeful', params: { seed: 4 } });
  const { sections, speech, ...plan } = result.plan;
  assert.deepEqual(plan, {
    ...{ style: 'lofi', mood: ['calm', 'hopeful'], energy: 0.3, brightness: 0.65 },
    ...{ key: 'E', scale: 'dorian', progression: 'i7-IV7-bVII6-v7' },
    ...{ bpm: 72, beatsPerBar: 4, bars: 6, seed: 4 },
  });
  assert.deepEqual(sections, [
    { name: 'intro', from: 0, to: 3, energy: 0.24, start: 0, end: 10 },
    { name: 'lift', from: 3, to: 6, energy: 0.72, start: 10, end: 20 },
  ]);
  assert.deepEqual(speech, [
    { start: 1, end: 4.5 },
    { start: 6.6, end: 9.3 },
    { start: 10.9, end: 13.6 },
  ]);
  assert.equal(
    result.notes[1],
    'Mood from the brief: calm, hopeful — energy 0.3, brightness 0.65.',
  );
});

test('a timeline without any sound gets a score at full level, with no keyframes', async () => {
  const edl = doc({
    video: [[clip(P['broll/city.mp4'], 0, 6, 0), clip(P['broll/beach.mp4'], 0, 8, 6)]],
  });
  assert.equal(edl.tracks.filter((track) => track.type === 'audio').length, 0);
  const { result, out, music, track } = await scored(edl, { params: { volume: 0.9 } });
  assert.deepEqual(rest(out).slice(0, 1), rest(edl));
  assert.deepEqual([out.tracks.length, track.name, track.type], [2, 'Music', 'audio']);
  assert.deepEqual([music.timelineStart, music.timelineEnd, music.volume], [0, 14, 0.9]);
  assert.deepEqual(music.keyframes, {});
  assert.match(
    result.notes.join('\n'),
    /\nNo speech was found in the span: the music keeps its level\.\n/,
  );
  assert.match(
    result.summary,
    /^Score: Cinematic in [A-G]b? minor, [\d.]+ BPM — \d+ bars over 14s, \d sections?$/,
  );
  // Ducking can be turned off where there is speech, too.
  const flat = await scored(talk(), { params: { duck: 0 } });
  assert.deepEqual(flat.music.keyframes, {});
  assert.match(
    flat.result.notes.join('\n'),
    /\nDucking is off \(0 dB\): the music keeps its level\.\n/,
  );
});

test('in range mode the score fills the range, and only speech inside it is ducked', async () => {
  const edl = talk();
  const directive = { mode: 'range', context: { range: { start: 5, end: 17 } } };
  const { result, out, music, track } = await scored(edl, directive);
  assert.deepEqual(rest(out).slice(0, 3), rest(edl), 'a range changes nothing around it either');
  assert.equal(track.name, 'Music');
  assert.deepEqual([music.timelineStart, music.timelineEnd, music.sourceIn], [5, 17, 0]);
  const { song } = music.music;
  assert.ok(
    Math.abs((song.bars * song.beatsPerBar * 60) / song.bpm - 12) < 1e-9,
    'whole bars in 12 s',
  );
  assert.deepEqual(result.plan.speech, [
    { start: 6.6, end: 9.3 },
    { start: 10.9, end: 13.6 },
  ]);
  // Keyframes are in the clip's own time: the first stretch begins 1.6 s into the range.
  assert.deepEqual(
    music.keyframes.volume.slice(0, 2).map((key) => key.t),
    [1.3, 1.55],
  );
  assert.equal(
    result.mode,
    'replace',
    'the timeline comes back whole, as from every in-place action',
  );
  assert.equal(result.range, null);
  assert.match(result.notes.join('\n'), /Sections: [a-z]+ 0:00/);
  // The selected clips are a scope too: from the first to the last of them.
  const city = edl.tracks[1].clips[1];
  const chosen = await scored(edl, { context: { selection: [city.clipId] } });
  assert.deepEqual([chosen.music.timelineStart, chosen.music.timelineEnd], [16, 20]);
  assert.equal(chosen.ctx.logs[0], 'Scoring 4s: the selected clip');
});

test('the clip goes on a free track called Music, else on a new one — never on a locked one', async () => {
  const withTrack = (change) => {
    const edl = talk();
    const bed = clip(P['music/bed.wav'], 0, 8, 0, { intent: 'music' });
    edl.tracks.push({ ...edl.tracks[2], trackId: 'a2', name: 'Music', clips: [] });
    change(edl.tracks[3], bed);
    return edl;
  };
  const free = await scored(withTrack(() => {}));
  assert.deepEqual([free.out.tracks.length, free.track.trackId], [4, 'a2']);
  assert.match(
    free.result.notes.join('\n'),
    /\nThe clip is on the track “Music”, which was free there\.\n/,
  );
  const busy = await scored(withTrack((track, bed) => track.clips.push(bed)));
  assert.equal(busy.out.tracks.length, 5);
  assert.notEqual(busy.track.trackId, 'a2');
  assert.equal(busy.out.tracks[3].clips.length, 1, 'the bed stays where it was');
  assert.match(
    busy.result.notes.join('\n'),
    /\nThere is other music in this span: mute or remove one of the two\.\n/,
  );
  const locked = withTrack((track) => (track.locked = true));
  const kept = await scored(locked);
  assert.deepEqual([kept.out.tracks.length, kept.out.tracks[3].clips.length], [5, 0]);
  assert.equal(kept.track.locked, false);
});

test('the same request gives the same song; seed, style, key and tempo change it', async () => {
  const renderer = fakeRenderer();
  const first = await scored(talk(), { params: { seed: 7 } }, renderer);
  const again = await scored(talk(), { params: { seed: 7 } }, renderer);
  assert.equal(again.music.music.key, first.music.music.key);
  assert.deepEqual(again.music.music.song, first.music.music.song);
  assert.deepEqual(
    renderer.calls.map((call) => call.cached),
    [false, true],
    'the second time the rendering is found',
  );
  const other = await scored(talk(), { params: { seed: 2 } }, renderer);
  assert.notEqual(other.music.music.key, first.music.music.key);
  assert.equal(
    other.result.plan.style,
    'ambient',
    'auto: the next variation is another style that suits',
  );
  const asked = await scored(talk(), {
    params: { style: 'house', key: 'F#', bpm: 126, energy: 0.9 },
  });
  const { song } = asked.music.music;
  assert.deepEqual([song.bpm, song.key, song.scale], [126, 'F#', getStyle('house').scale]);
  assert.deepEqual([song.bars, asked.music.timelineEnd], [10, 20], 'ten whole bars, then the ring');
  assert.match(
    asked.result.notes.join('\n'),
    /\nAt the 126 BPM asked for, the music ends after 10 bars and rings out for the 1s left of the 20s\.\n/,
  );
  assert.equal(asked.result.notes[0], 'Style House, as chosen in the form.');
});

test('cancelling while the music renders leaves nothing behind', async () => {
  const stop = new AbortController();
  const renderer = fakeRenderer({ onChunk: (done) => done >= 96000 && stop.abort() });
  const dir = renderer.dir(park.dir);
  rmSync(dir, { recursive: true, force: true });
  const ctx = await makeContext(
    park,
    { action: 'score', params: { seed: 9 } },
    { edl: talk(), signal: stop.signal },
  );
  await assert.rejects(score(ctx, renderer), (err) => err.killedBy === 'aborted');
  assert.deepEqual(renderer.calls.length, 1);
  assert.deepEqual(existsSync(dir) ? readdirSync(dir) : [], [], 'no rendering, whole or partial');
  // Cancelled before it starts: nothing is rendered at all.
  const early = AbortSignal.abort();
  const idle = fakeRenderer();
  const second = await makeContext(park, { action: 'score' }, { edl: talk(), signal: early });
  await assert.rejects(score(second, idle), (err) => err.name === 'AbortError');
  assert.equal(idle.calls.length, 0);
});

test('a renderer that refuses fails the job in its own words; an empty timeline is refused before', async () => {
  const heavy = Object.assign(new Error('The song is too heavy to render'), { status: 422 });
  const ctx = await makeContext(park, { action: 'score' }, { edl: talk() });
  await assert.rejects(score(ctx, fakeRenderer({ fail: heavy })), (err) => {
    assert.ok(err instanceof DirectorError);
    assert.deepEqual([err.status, err.message], [422, 'The song is too heavy to render']);
    return true;
  });
  const broken = await makeContext(park, { action: 'score' }, { edl: talk() });
  await assert.rejects(score(broken, fakeRenderer({ fail: new TypeError('boom') })), TypeError);
  const empty = await makeContext(
    park,
    { action: 'score' },
    { edl: doc({ video: [[]], audio: [[]] }) },
  );
  await assert.rejects(score(empty, fakeRenderer()), /There is nothing on the timeline to score/);
});
