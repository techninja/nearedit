import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { recipeKey } from '#utils/web/index.js';
import { trackOf } from '#utils/web/testkit.js';
import * as E from './index.js';
import { assertValid, deepFreeze, onFrameGrid, testClip, testEdl } from './testkit.js';

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

/** A recipe out of a handful: different lengths, some without an address. */
function someRecipe(rand) {
  const steps = [
    { do: 'click', target: 'text=Go' },
    { do: 'type', text: 'x'.repeat(Math.floor(rand() * 40)), target: 'label=Name' },
    { do: 'wait', duration: Math.round(rand() * 80) / 10 },
    { do: 'focus', target: '#plans', zoom: rand() < 0.5 ? 0 : 3 },
    { do: 'scroll', to: 'bottom', hold: rand() * 2 },
  ].filter(() => rand() < 0.6);
  const url = rand() < 0.1 ? '' : `https://example.com/${Math.floor(rand() * 3)}`;
  return { url, lead: rand() < 0.3 ? 0 : 0.6, tail: Math.round(rand() * 30) / 10, steps };
}

/** One random edit; web clips are picked more often than the footage around them. */
function randomEdit(doc, rand) {
  const refs = E.allClips(doc);
  if (!refs.length) return E.insertWebClip(doc, someRecipe(rand), { time: rand() * 20 });
  const web = refs.filter(({ clip }) => clip.web);
  const from = web.length && rand() < 0.7 ? web : refs;
  const { clip } = from[Math.floor(rand() * from.length)];
  const id = clip.clipId;
  const time = Math.round(rand() * 300) / 10;
  const delta = Math.round((rand() - 0.5) * 120) / 10 || 0;
  const flags = { ripple: rand() < 0.2, autoCrossfade: rand() < 0.7, linked: rand() < 0.8 };
  const ops = [
    () => E.moveClips(doc, [id], { ...flags, delta }),
    () => E.trimClipStart(doc, id, clip.timelineStart + delta, flags),
    () => E.trimClipEnd(doc, id, clip.timelineEnd + delta, flags),
    () => E.splitClips(doc, clip.timelineStart + rand() * (clip.timelineEnd - clip.timelineStart)),
    () => E.slipClip(doc, id, delta),
    () => E.slipTrim(doc, id, rand() < 0.5 ? 'start' : 'end', time),
    () => E.rollEdit(doc, id, rand() < 0.5 ? 'start' : 'end', time),
    () => E.slideClip(doc, id, delta),
    () => E.duplicateClips(doc, [id], { time, autoCrossfade: flags.autoCrossfade }),
    () => E.rippleDelete(doc, [id], { scope: rand() < 0.5 ? 'track' : 'all' }),
    () => E.closeGaps(doc),
    () =>
      E.updateClip(doc, id, { sourceIn: delta, label: 'x', web: { key: 'no' }, sourceFile: '' }),
    () => E.insertWebClip(doc, someRecipe(rand), { time, autoCrossfade: flags.autoCrossfade }),
    () => E.updateWebRecipe(doc, id, someRecipe(rand), flags),
    () => E.updateWebRecipe(doc, id, (recipe) => ({ ...recipe, tail: rand() * 5 })),
    () => {
      const stale = rand() < 0.3;
      const key = recipeKey(stale ? someRecipe(rand) : clip.web?.recipe, doc.fps);
      const duration = (E.webDuration(clip, doc.fps) ?? 4) + (rand() < 0.2 ? delta : 0);
      return E.setWebRecording(doc, id, { file: `/p/.nearedit/web/${key}.mp4`, key, duration });
    },
    () =>
      E.applyWebZoom(
        doc,
        id,
        trackOf([{ rect: { x: 600 * rand(), y: 300, width: 90, height: 40 } }]),
      ),
    () => E.clearWebZoom(doc, id),
    () => E.normalizeEdl({ ...doc, fps: [24, 25, 30, 60][Math.floor(rand() * 4)] }),
  ];
  return ops[Math.floor(rand() * ops.length)]();
}

describe('web clips: soak', () => {
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    it(`400 random edits keep every invariant (seed ${seed})`, () => {
      const rand = mulberry(seed);
      const film = testClip('film', 0, 12, { linkedClipId: 'sound' });
      const sound = testClip('sound', 0, 12, {
        sourceFile: '/media/film.mp4',
        linkedClipId: 'film',
      });
      let doc = testEdl({ v1: [film, testClip('next', 14, 22)], a1: [sound] });
      doc = E.insertWebClip(doc, someRecipe(rand), { time: 2 });
      doc = E.insertWebClip(doc, { url: 'https://example.org' }, { trackId: 'v1', time: 22 });
      let webSeen = 0;
      for (let i = 0; i < 400; i++) {
        const next = randomEdit(deepFreeze(doc), rand);
        assertValid(next);
        assert.ok(onFrameGrid(next), `off the frame grid after edit ${i}`);
        for (const { clip, track } of E.allClips(next)) {
          if (!E.isWebClip(clip)) continue;
          webSeen++;
          const limit = E.webDuration(clip, next.fps);
          assert.ok(clip.sourceIn >= -1e-9 && clip.sourceOut <= limit + 1e-6, `window, edit ${i}`);
          assert.equal(E.isTimed(clip, track), true);
        }
        if (i % 20 === 0) assert.deepEqual(E.normalizeEdl(next), next, `normal form, edit ${i}`);
        doc = next;
      }
      assert.ok(webSeen > 300, 'the walk kept web clips on the timeline');
      const saved = JSON.parse(JSON.stringify(E.toSavedDocument(doc)));
      assert.deepEqual(E.fromSavedDocument(saved).edl, doc);
    });
  }
});
