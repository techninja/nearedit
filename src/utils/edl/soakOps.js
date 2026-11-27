/**
 * The schema-v3 half of the soak test: random calls of every operation
 * that edits generators, effects, keyframes, curves and track settings
 * (the start document for them is in soakFixture.js). Not part of the
 * runtime API — imported by soak.test.js.
 * @module utils/edl/soakOps
 */

import * as E from './index.js';

/** @typedef {import('./types.js').Edl} Edl */

const PATHS = [
  'transform.x',
  'transform.opacity',
  'transform.cropLeft',
  'volume',
  'text.color',
  'text.fontSize',
  'effects.fx_a.radius',
  'effects.fx_a.center.x',
  'generator.params.angle',
  'generator.params.tint',
  'generator.seed',
  'fadeIn',
  'transform.fit',
];
const PARTS = ['transform', 'effects', 'keyframes', 'blendMode', 'fades', 'text'];

/**
 * Random calls of the v3 operations, as thunks the soak test picks from.
 * @param {Edl} doc
 * @param {() => number} rand - Deterministic 0..1 source
 * @returns {(() => Edl)[]}
 */
export function v3Ops(doc, rand) {
  const pick = (list) => list[Math.floor(rand() * list.length)];
  const clips = E.allClips(doc).map((ref) => ref.clip);
  const keyed = clips.filter((clip) => E.animatedPaths(clip).length);
  const anyId = () => pick(clips)?.clipId ?? 'none';
  const time = () => Math.round(rand() * 45 * 30) / 30 + (rand() < 0.2 ? 0.011 : 0);
  const value = () => pick([rand() * 400 - 100, rand(), '#12ab9f', 'junk', NaN, 0]);
  const target = () => (rand() < 0.7 ? { clipId: anyId() } : { trackId: pick(doc.tracks).trackId });
  /** Mostly a clip or track that has effects, so the stack operations have something to do. */
  const holder = () => {
    const stacked = [
      ...clips.filter((clip) => clip.effects.length).map((clip) => ({ clipId: clip.clipId })),
      ...doc.tracks.filter((t) => t.effects.length).map((t) => ({ trackId: t.trackId })),
    ];
    return rand() < 0.8 && stacked.length ? pick(stacked) : target();
  };
  const fxOf = (at) => pick(E.effectsOf(doc, at))?.effectId ?? 'none';
  /** A clip that has keys, one of its paths and the timeline time of one of its keys. */
  const aKey = () => {
    const clip = pick(keyed);
    const entry = clip && pick(E.listKeyframes(clip));
    return { id: clip?.clipId ?? anyId(), path: entry?.path ?? pick(PATHS), at: entry?.time ?? 0 };
  };
  const parts = () => Object.fromEntries(PARTS.map((part) => [part, rand() < 0.5]));
  return [
    () => E.setKeyframe(doc, anyId(), pick(PATHS), time(), value(), { ease: pick(E.EASINGS) }),
    () => E.setKeyframe(doc, aKey().id, pick(PATHS), time(), rand() * 50),
    () => (({ id, path, at }) => E.setKeyframe(doc, id, path, at, value()))(aKey()),
    () => (({ id, path, at }) => E.removeKeyframe(doc, id, path, at))(aKey()),
    () => (({ id, path, at }) => E.moveKeyframe(doc, id, path, at, time()))(aKey()),
    () => (({ id, path, at }) => E.setKeyframeEase(doc, id, path, at, pick(E.EASINGS)))(aKey()),
    () => (({ id, at }) => E.moveKeyframesAt(doc, id, at, time()))(aKey()),
    () => (({ id, at }) => E.removeKeyframesAt(doc, id, at))(aKey()),
    () => (({ id, path }) => E.clearKeyframes(doc, id, rand() < 0.7 ? path : undefined))(aKey()),
    () => E.setValueAt(doc, anyId(), pick(PATHS), value(), time()),
    () => (({ id, path, at }) => E.setValueAt(doc, id, path, value(), at + rand()))(aKey()),
    () => E.setAnimated(doc, anyId(), pick(PATHS), rand() < 0.6, time(), { value: 3 }),
    () => (({ id, path }) => E.setAnimated(doc, id, path, false, time()))(aKey()),
    () =>
      E.addEffect(doc, target(), pick(['blur', 'glow', 'tint']), {
        effectId: rand() < 0.5 ? 'fx_a' : undefined,
        params: { radius: rand() * 20, junk: NaN, nested: { on: true } },
        index: Math.floor(rand() * 3),
      }),
    () => ((at) => E.removeEffect(doc, at, fxOf(at)))(holder()),
    () => ((at) => E.moveEffect(doc, at, fxOf(at), Math.floor(rand() * 4)))(holder()),
    () => ((at) => E.setEffectEnabled(doc, at, fxOf(at)))(holder()),
    () =>
      ((at) => E.updateEffect(doc, at, fxOf(at), { params: { radius: rand() * 9, size: null } }))(
        holder(),
      ),
    () =>
      E.insertGenerator(
        doc,
        { type: pick(['solid', 'particles']), params: { rate: rand() * 100 } },
        {
          time: time(),
          duration: 1 + rand() * 4,
          trackId: rand() < 0.3 ? pick(doc.tracks).trackId : undefined,
          clip: {
            blendMode: 'add',
            keyframes: {
              'transform.opacity': [
                { t: 0, v: 0 },
                { t: 1, v: 1 },
              ],
            },
          },
        },
      ),
    () =>
      E.updateGenerator(doc, anyId(), {
        type: pick([undefined, 'noise', '']),
        seed: rand() * 100,
        params: { angle: rand() * 360, stops: rand() < 0.3 ? null : [0, rand()] },
      }),
    () =>
      E.updateClip(doc, anyId(), {
        blendMode: pick([...E.BLEND_MODES, 'dodge']),
        fadeInCurve: pick(E.FADE_CURVES),
        fadeOutCurve: pick([...E.FADE_CURVES, 'bouncy']),
        text: { animateOut: { type: pick(E.TEXT_ANIMATIONS), stagger: rand() }, weight: 700 },
        keyframes: { 'transform.rotation': rand() < 0.5 ? null : [{ t: rand() * 4, v: 90 }] },
      }),
    () => E.setTrackOpacity(doc, pick(doc.tracks).trackId, rand() * 1.5),
    () => E.setTrackBlendMode(doc, pick(doc.tracks).trackId, pick([...E.BLEND_MODES, 'burn'])),
    () => E.pasteAttributes(doc, anyId(), [anyId(), anyId()], rand() < 0.4 ? undefined : parts()),
  ];
}
