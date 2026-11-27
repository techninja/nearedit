import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as E from './index.js';
import { assertValid, deepFreeze, layout, onFrameGrid, testClip, testEdl } from './testkit.js';

const fades = (d) => d.tracks.map((t) => `${t.trackId}${t.locked ? '(L)' : ''}: ` + t.clips.map((c) => `${c.clipId.slice(-4)}[${c.fadeIn.toFixed(2)},${c.fadeOut.toFixed(2)}]->${c.linkedClipId.slice(-4)}`).join(' '));

/** Small deterministic PRNG so failures can be replayed by seed. */
function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SOURCE_LENGTH = 60;
const sourceDurations = new Proxy({}, { get: (_, key) => (String(key).endsWith('.png') ? undefined : SOURCE_LENGTH) });

function startDocument() {
  const pair = (id, start, end, sourceIn) => [
    testClip(id, start, end, { sourceIn, sourceOut: sourceIn + end - start, linkedClipId: `${id}_a` }),
    testClip(`${id}_a`, start, end, { sourceFile: `/media/${id}.mp4`, sourceIn, sourceOut: sourceIn + end - start, linkedClipId: id }),
  ];
  const [p1, p1a] = pair('p1', 0, 6, 2);
  const [p2, p2a] = pair('p2', 5, 12, 0);
  const [p3, p3a] = pair('p3', 14, 20, 10);
  p1.fadeOut = p2.fadeIn = p1a.fadeOut = p2a.fadeIn = 1;
  const still = testClip('still', 3, 8, { sourceFile: '/media/still.png' });
  const title = testClip('title', 9, 13, { sourceFile: '', text: { content: 'Hello' }, fadeIn: 0.5, fadeOut: 0.5 });
  const music = testClip('music', 0, 40, { sourceFile: '/media/music.mp3' });
  const doc = testEdl({ v2: [still, title], v1: [p1, p2, p3], a1: [p1a, p2a, p3a], a2: [music] });
  return E.addMarker(E.addMarker(doc, 5, { label: 'one' }), 15, { label: 'two' });
}

function makeFragment(rand) {
  const clips = [];
  let t = 0;
  for (let i = 0; i < 1 + Math.floor(rand() * 3); i++) {
    const length = 1 + rand() * 3;
    const id = `f${i}`;
    clips.push({ clipId: id, linkedClipId: `${id}a`, sourceFile: '/media/frag.mp4', sourceIn: i, sourceOut: i + length, timelineStart: t, timelineEnd: t + length });
    t += length - (rand() < 0.3 ? 0.4 : 0);
  }
  const audio = clips.map((c) => ({ ...c, clipId: `${c.clipId}a`, linkedClipId: c.clipId }));
  return {
    tracks: [
      { type: 'video', index: Math.floor(rand() * 3), name: 'Director V', clips },
      { type: 'audio', index: 0, clips: audio },
    ],
    markers: [{ time: 1, label: 'cut' }],
  };
}

function randomOp(doc, rand) {
  const clips = E.allClips(doc);
  const pick = (list) => list[Math.floor(rand() * list.length)];
  const anyClip = () => pick(clips)?.clip.clipId ?? 'none';
  const some = () => [anyClip(), ...(rand() < 0.3 ? [anyClip()] : [])];
  const track = () => pick(doc.tracks).trackId;
  const time = () => Math.round(rand() * 45 * 30) / 30 + (rand() < 0.2 ? 0.011 : 0);
  const flags = { autoCrossfade: rand() < 0.6, linked: rand() < 0.85 };
  const ripple = { ripple: rand() < 0.4, rippleScope: rand() < 0.5 ? 'all' : 'track' };
  const ops = [
    () => E.moveClips(doc, some(), { delta: (rand() - 0.5) * 20, ...flags }),
    () => E.moveClips(doc, some(), { delta: (rand() - 0.5) * 6, toTrackId: track(), ...flags }),
    () => E.moveClips(doc, some(), { delta: rand() * 4, snap: { threshold: 0.3, playhead: time() } }),
    () => E.trimClipStart(doc, anyClip(), time(), { sourceDurations, ...flags, ...ripple }),
    () => E.trimClipEnd(doc, anyClip(), time(), { sourceDurations, ...flags, ...ripple }),
    () => E.slipClip(doc, anyClip(), (rand() - 0.5) * 10, { sourceDurations }),
    () => E.splitClips(doc, time()),
    () => E.splitClips(doc, time(), { clipIds: some(), linked: flags.linked }),
    () => E.deleteClips(doc, some(), flags),
    () => E.rippleDelete(doc, some(), { scope: ripple.rippleScope, ...flags }),
    () => E.rippleInsert(doc, time(), rand() * 3, rand() < 0.5 ? {} : { trackIds: [track()] }),
    () => E.rippleDeleteRange(doc, time(), time(), rand() < 0.5 ? {} : { trackIds: [track()] }),
    () => E.closeGaps(doc, track(), { from: rand() < 0.5 ? 0 : time() }),
    () => E.setClipFades(doc, anyClip(), { fadeIn: rand() * 3, fadeOut: rand() < 0.5 ? rand() * 3 : undefined }),
    () => E.updateClip(doc, anyClip(), { label: 'x', volume: rand() * 3, transform: { opacity: rand() * 2, kenBurns: { enabled: true, endScale: 1.2 } } }),
    () => E.addTrack(doc, rand() < 0.5 ? 'video' : 'audio'),
    () => (doc.tracks.length > 7 ? E.removeTrack(doc, track()) : doc),
    () => E.moveTrack(doc, track(), Math.floor(rand() * 4)),
    () => E.toggleTrackLock(doc, track()),
    () => E.toggleTrackMute(doc, track()),
    () => E.groupClips(doc, [anyClip(), anyClip(), anyClip()]),
    () => E.ungroupClips(doc, some()),
    () => E.linkClips(doc, anyClip(), anyClip()),
    () => E.unlinkClips(doc, some()),
    () => E.pasteClips(doc, E.copyClips(doc, E.expandSelection(doc, some())), { time: time(), trackId: rand() < 0.5 ? track() : undefined, ripple: rand() < 0.3, ...flags }),
    () => E.duplicateClips(doc, some(), flags),
    () => E.insertMedia(doc, { filePath: '/media/new.mp4', type: 'video', duration: 8, hasAudio: rand() < 0.7 }, { time: rand() < 0.5 ? time() : undefined, ripple: rand() < 0.3, ...flags }),
    () => E.insertMedia(doc, { filePath: '/media/pic.png', type: 'image' }, { time: time(), trackId: track() }),
    () => E.insertMedia(doc, { filePath: '/media/song.mp3', type: 'audio', duration: 30 }, { sourceIn: 3, sourceOut: 9 }),
    () => E.insertTitle(doc, { text: 'Title', time: time(), duration: 1 + rand() * 3, trackId: rand() < 0.3 ? track() : undefined }),
    () => E.addMarker(doc, time(), { label: 'm' }),
    () => (doc.markers[0] ? E.moveMarker(doc, pick(doc.markers).markerId, time()) : doc),
    () => (doc.markers.length > 3 ? E.removeMarker(doc, pick(doc.markers).markerId) : doc),
    ...['append', 'prepend', 'insert', 'range', 'replace'].map((mode) => () => {
      if (mode === 'replace' && rand() < 0.8) return doc;
      const a = time();
      return E.applyDirectorResult(doc, { mode, at: a, range: { start: a, end: a + rand() * 6 }, ...makeFragment(rand) });
    }),
  ];
  const index = Math.floor(rand() * ops.length);
  return { index, next: ops[index]() };
}

/** Clips on a track that was locked before the operation must not change. */
function assertLockedUntouched(before, after, label) {
  const strip = (clips) => clips.map((clip) => ({ ...clip, linkedClipId: '' }));
  for (const track of before.tracks.filter((t) => t.locked)) {
    const now = after.tracks.find((t) => t.trackId === track.trackId);
    assert.ok(now, `${label}: locked track ${track.trackId} disappeared`);
    assert.deepEqual(strip(now.clips), strip(track.clips), `${label}: locked track changed`);
  }
}

describe('soak: random operations keep the document valid', () => {
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    it(`seed ${seed}: 400 operations`, () => {
      const rand = mulberry(seed);
      let doc = deepFreeze(assertValid(startDocument()));
      for (let step = 0; step < 400; step++) {
        const frozen = JSON.stringify(doc);
        const { index, next } = randomOp(doc, rand);
        const label = `seed ${seed} step ${step} op ${index}`;
        if (process.env.SOAK_TRACE === `${seed}:${step}`) console.log(layout(doc), layout(next), fades(doc), fades(next));
        assert.equal(JSON.stringify(doc), frozen, `${label}: input was mutated`);
        try {
          assertValid(next, { sourceDurations });
        } catch (error) {
          throw new Error(`${label}: ${error.message}`);
        }
        assert.ok(onFrameGrid(next), `${label}: a clip left the frame grid`);
        assertLockedUntouched(doc, next, label);
        assert.deepEqual(E.normalizeEdl(next), next, `${label}: normalizeEdl changed a valid document`);
        doc = deepFreeze(next);
        if (E.allClips(doc).length > 60) doc = deepFreeze(E.deleteClips(doc, E.allClips(doc).slice(20).map((r) => r.clip.clipId)));
      }
    });
  }
});
