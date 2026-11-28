import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { builtinKit, captionStyleOf, normalizeKit, resolveKit } from '#utils/brand/index.js';
import { applyDirected } from '#utils/director/applyResult.js';
import { commit, getDoc, loadDoc, undo } from '#utils/editor/session.js';
import { captionedClips, setCaptionStyle, setCaptions, validateEdl } from '#utils/edl/index.js';
import { makeContext } from '../testing/context.js';
import { startFakeLlm } from '../testing/fakeLlm.js';
import { checkResult } from '../testing/invariants.js';
import { createParkProject } from '../testing/park.js';
import { clip, doc, pair } from '../testing/timeline.js';
import { addCaptions } from './addCaptions.js';

let park;
let P;
let fake;
before(async () => {
  park = await createParkProject();
  P = park.paths;
  fake = await startFakeLlm();
});
after(async () => {
  await fake.close();
  park.cleanup();
});

/** Run `add_captions` as it comes (as `words`) and merge the result as the editor does. */
async function run(edl, directive = {}, extra = {}) {
  const ctx = await makeContext(park, { action: 'add_captions', ...directive }, { edl, ...extra });
  const result = await addCaptions(ctx);
  const durations = Object.fromEntries(ctx.media.map((m) => [m.filePath, m.duration]));
  assert.deepEqual(checkResult(result, { fps: 30, durations, roots: [park.dir], edl }), []);
  assert.equal(result.mode, 'replace');
  const out = applyDirected(edl, result);
  assert.deepEqual(validateEdl(out).errors || [], []);
  return { result, out, ctx };
}
const captioned = (edl) => captionedClips(edl).map(({ clip: c }) => c.sourceFile.split('/').pop());

/** What the built-in kit — the one in use when a project chose none — says about captions. */
const CLEAN = captionStyleOf(resolveKit(builtinKit('clean')));
const FACE = { family: 'Acme Sans', weight: 700, file: '/nowhere/AcmeSans-Bold.ttf' };
/** A kit of its own: boxed captions in its own colours and its own font file. */
const ACME = resolveKit([
  normalizeKit({
    ...{ id: 'acme', name: 'Acme', extends: 'builtin:clean', fonts: [FACE] },
    tokens: {
      color: { surface: '#101c44', text: '#f4f7ff', accent: '#ff6b2c' },
      font: { heading: { family: 'Acme Sans', weight: 700 } },
      caption: { preset: 'boxed' },
    },
  }),
]);

/** An interview (picture and sound), a voice-over, an untranscribed memo and a music bed. */
function talk() {
  const [a, aSound] = pair(P['interview.mp4'], 0.9, 4.6, 10);
  const voice = clip(P['voice.wav'], 0.4, 2.1, 15);
  const memo = clip(P['voice-memo.wav'], 0, 4, 18);
  const bed = clip(P['music/bed.wav'], 0, 22, 0, { intent: 'music' });
  return doc({ video: [[a]], audio: [[aSound, voice, memo], [bed]] });
}

test('by default captions are switched on for the speech — no title clips, no new track', async () => {
  const edl = talk();
  const { result, out } = await run(edl);
  assert.equal(result.summary, 'Captions switched on for 2 clips (Clean, from the brand kit)');
  assert.match(result.notes.join(' '), /voice-memo\.wav has no transcript for this part/);
  assert.deepEqual(captioned(out), ['interview.mp4', 'voice.wav']);
  assert.equal(out.tracks.length, edl.tracks.length);
  assert.ok(out.tracks.every((t) => t.clips.every((c) => !c.text?.content)));
  // The sound clip of a pair carries the voice; its picture stays as it was.
  assert.equal(out.tracks[1].clips[0].captions.on, true);
  assert.equal('captions' in out.tracks[0].clips[0], false);
  assert.equal(out.tracks[0].clips[0].linkedClipId, out.tracks[1].clips[0].clipId);
  // Music is not speech.
  assert.equal('captions' in out.tracks[2].clips[0], false);
});

test('with no look asked the captions follow the brand kit, unless the timeline has a style of its own', async () => {
  const edl = talk();
  const last = (/** @type {any} */ ran) => ran.result.notes.at(-1);
  // A project that chose no kit works in the built-in one.
  const plain = await run(edl);
  assert.deepEqual(plain.result.document, { captions: { style: CLEAN } });
  assert.deepEqual(plain.out.captions, { style: CLEAN });
  assert.equal(
    last(plain),
    'No look was asked for and the timeline had no caption style of its own, so the captions ' +
      'follow the project’s brand kit “Clean”: Clean.',
  );
  // The project's kit: its preset, its colours, and the font file the captions are set in.
  const acme = await run(edl, {}, { kit: ACME });
  assert.equal(acme.result.summary, 'Captions switched on for 2 clips (Boxed, from the brand kit)');
  assert.match(last(acme), /follow the project’s brand kit “Acme”: Boxed, set in Acme Sans\.$/);
  const style = captionStyleOf(ACME);
  assert.deepEqual(
    [style.preset, style.font, style.plate.color],
    ['boxed', { family: 'Acme Sans' }, '#101c44'],
  );
  assert.deepEqual(acme.result.document, {
    fonts: [{ ...FACE, style: 'normal' }],
    captions: { style },
  });
  assert.deepEqual(acme.out.captions, { style });
  assert.deepEqual(acme.out.fonts, [{ ...FACE, style: 'normal' }]);
  // A look that is asked for wins over the kit, and nothing is said about the kit.
  const asked = await run(edl, { prompt: 'karaoke' }, { kit: ACME });
  assert.deepEqual(asked.result.document, { captions: { style: { preset: 'karaoke' } } });
  assert.equal(/brand kit/.test(asked.result.notes.join(' ') + asked.result.summary), false);
  // A timeline with a style of its own keeps it — the plain default too, once it was chosen.
  for (const [own, name] of [
    [{ preset: 'pop', size: 9 }, 'Pop'],
    [{ preset: 'clean' }, 'Clean'],
  ]) {
    const kept = await run(setCaptionStyle(edl, own), {}, { kit: ACME });
    assert.equal(kept.result.document, undefined);
    assert.deepEqual(kept.out.captions, { style: own });
    assert.equal(kept.result.summary, `Captions switched on for 2 clips (${name})`);
    assert.equal(
      last(kept),
      `No look was asked for: the timeline keeps the caption style it has (${name}).`,
    );
  }
  // Following the kit happens once: from then on the style is the timeline's own.
  const again = await run(acme.out, {}, { kit: resolveKit(builtinKit('playful')) });
  assert.equal(again.result.summary, 'Captions were already on for 2 clips (Boxed)');
  assert.equal(again.result.document, undefined);
  assert.deepEqual(again.out.captions, { style });
  // No captions, no style: a timeline nothing was switched on in is left without one.
  const silent = await run(
    doc({ video: [[]], audio: [[clip(P['music/bed.wav'], 0, 5, 0)]] }),
    {},
    { kit: ACME },
  );
  assert.match(silent.result.summary, /^No speech with a transcript/);
  assert.equal(silent.result.document, undefined);
  assert.equal(
    silent.result.notes.some((note) => /brand kit|No look/.test(note)),
    false,
  );
});

test('one undo step takes the whole thing back', async () => {
  const edl = talk();
  const { result } = await run(edl, { prompt: 'big bold captions' });
  loadDoc(edl);
  commit(applyDirected(getDoc(), result));
  assert.deepEqual(captioned(getDoc()), ['interview.mp4', 'voice.wav']);
  assert.equal(getDoc().captions.style.preset, 'pop');
  assert.equal(undo(), true);
  assert.equal(getDoc(), edl);
  assert.equal(undo(), false);
});

test('the look is the form’s, else read from the words, else left alone', async () => {
  const edl = talk();
  const form = await run(edl, { params: { preset: 'boxed' }, prompt: 'big bold captions' });
  assert.deepEqual(form.out.captions, { style: { preset: 'boxed' } });
  assert.match(form.result.summary, /\(Boxed\)$/);
  const words = await run(edl, { prompt: 'Karaoke please' });
  assert.deepEqual(words.result.document, { captions: { style: { preset: 'karaoke' } } });
  assert.match(words.result.notes.join(' '), /“Karaoke please” was read as the Karaoke look/);
  // The same look as the timeline has: what was fine-tuned by hand is kept.
  const tuned = setCaptionStyle(edl, { preset: 'pop', size: 9 });
  const same = await run(tuned, { prompt: 'big and bold' });
  assert.equal(same.result.document, undefined);
  assert.deepEqual(same.out.captions.style, { preset: 'pop', size: 9 });
  const other = await run(tuned, { prompt: 'minimal' });
  assert.deepEqual(other.out.captions.style, { preset: 'minimal' });
  const none = await run(tuned, { prompt: 'add captions to the interview' });
  assert.deepEqual(none.out.captions.style, { preset: 'pop', size: 9 });
  assert.match(none.result.summary, /\(Pop\)$/);
});

test('the language model only chooses among the presets, and only when asked', async () => {
  const edl = talk();
  const directive = { prompt: 'something that suits a cooking show', params: { useLlm: true } };
  fake.setReply(() => '{"preset": "boxed"}');
  const before = fake.requests.length;
  const chosen = await run(edl, directive, { llmUrl: fake.url });
  assert.deepEqual(chosen.out.captions, { style: { preset: 'boxed' } });
  assert.match(chosen.result.notes.join(' '), /Boxed\) was chosen by the LLM \(test-model\)/);
  const asked = fake.requests.at(-1).body.messages;
  assert.match(asked[0].content, /- pop: .*\n- karaoke: /);
  assert.match(asked[1].content, /horizontal.*a cooking show/);
  // Words that name a look, or a look on the form, never reach the model.
  await run(edl, { ...directive, prompt: 'big bold captions' }, { llmUrl: fake.url });
  await run(edl, { ...directive, params: { useLlm: true, preset: 'clean' } }, { llmUrl: fake.url });
  assert.equal(fake.requests.length, before + 1);
  // A reply that names no preset, or no model at all: captions go on, as if no look had
  // been asked for — the timeline's own style stays, and one without follows the brand kit.
  fake.setReply(() => '{"preset": "comic"}');
  const odd = await run(edl, directive, { llmUrl: fake.url });
  assert.match(odd.result.notes.join(' '), /could not choose a look \(its reply named none/);
  assert.match(
    odd.result.notes.at(-1),
    /^No look was asked for and .* brand kit “Clean”: Clean\.$/,
  );
  assert.deepEqual(odd.out.captions, { style: CLEAN });
  assert.deepEqual(captioned(odd.out), ['interview.mp4', 'voice.wav']);
  const tuned = setCaptionStyle(edl, { preset: 'pop', size: 9 });
  const kept = await run(tuned, directive, { llmUrl: fake.url });
  assert.deepEqual(kept.out.captions, tuned.captions);
  assert.match(kept.result.notes.at(-1), /the timeline keeps the caption style it has \(Pop\)/);
  const off = await run(edl, directive);
  assert.match(off.result.notes.join(' '), /could not choose a look \(.*LLM_PROVIDER=none/);
  // Not asked for: the model is left alone even when it is there.
  await run(edl, { prompt: directive.prompt }, { llmUrl: fake.url });
  assert.equal(fake.requests.length, before + 3);
});

test('selection and range limit what is switched on; a chosen clip is taken as it is', async () => {
  const edl = talk();
  const [interview, voice, memo] = edl.tracks[1].clips;
  const picked = await run(edl, { context: { selection: [edl.tracks[0].clips[0].clipId] } });
  assert.deepEqual(captioned(picked.out), ['interview.mp4']);
  const ranged = await run(edl, { mode: 'range', context: { range: { start: 14, end: 17 } } });
  assert.deepEqual(captioned(ranged.out), ['voice.wav']);
  // Muted speech is skipped unless it is the one asked for.
  edl.tracks[1].muted = true;
  const muted = await run(edl);
  assert.equal(
    muted.result.summary,
    'No speech with a transcript on the timeline — no captions switched on',
  );
  const asked = await run(edl, { context: { selection: [voice.clipId, memo.clipId] } });
  assert.deepEqual(captioned(asked.out), ['voice.wav']);
  assert.match(asked.result.notes.join(' '), /voice-memo\.wav has no transcript/);
  assert.ok(interview.clipId);
});

test('what is already on stays on, and is said', async () => {
  const edl = talk();
  const first = setCaptions(edl, [edl.tracks[1].clips[0].clipId], true);
  const more = await run(first);
  assert.equal(more.result.summary, 'Captions switched on for 1 clip (Clean, from the brand kit)');
  assert.match(more.result.notes[0], /1 clip already had captions switched on/);
  const again = await run(more.out);
  assert.equal(again.result.summary, 'Captions were already on for 2 clips (Clean)');
  const restyled = await run(more.out, { prompt: 'karaoke' });
  assert.equal(restyled.result.summary, 'Captions were already on — the style is now Karaoke');
  assert.equal(restyled.out.captions.style.preset, 'karaoke');
  // Switched on by hand and never styled: the timeline has no style yet, so it takes the kit's.
  const all = setCaptions(first, [edl.tracks[1].clips[1].clipId], true);
  const styled = await run(all, {}, { kit: ACME });
  assert.equal(
    styled.result.summary,
    'Captions were already on — the style is now Boxed, from the brand kit',
  );
  assert.deepEqual(styled.out.captions, { style: captionStyleOf(ACME) });
});

test('words written on a clip count as a transcript; a locked track is left alone', async () => {
  const memo = clip(P['voice-memo.wav'], 0, 4, 0, {
    captions: {
      on: false,
      words: [
        [0.5, 1, 'hello'],
        [1.1, 1.6, 'there'],
      ],
    },
  });
  const own = await run(doc({ video: [[]], audio: [[memo]] }));
  assert.equal(own.out.tracks[1].clips[0].captions.on, true);
  assert.equal(own.out.tracks[1].clips[0].captions.words.length, 2);
  const edl = doc({ video: [[]], audio: [[clip(P['voice.wav'], 0.4, 2.1, 0)]] });
  edl.tracks[1].locked = true;
  const locked = await run(edl);
  assert.deepEqual(locked.out.tracks[1].clips, edl.tracks[1].clips);
  assert.deepEqual(captioned(locked.out), []);
});
