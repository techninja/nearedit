import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
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
  assert.deepEqual(checkResult(result, { fps: 30, durations, roots: [park.dir] }), []);
  assert.equal(result.mode, 'replace');
  const out = applyDirected(edl, result);
  assert.deepEqual(validateEdl(out).errors || [], []);
  return { result, out, ctx };
}
const captioned = (edl) => captionedClips(edl).map(({ clip: c }) => c.sourceFile.split('/').pop());

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
  assert.equal(result.summary, 'Captions switched on for 2 clips (Clean)');
  assert.match(result.notes.join(' '), /voice-memo\.wav has no transcript for this part/);
  assert.deepEqual(captioned(out), ['interview.mp4', 'voice.wav']);
  assert.equal(out.tracks.length, edl.tracks.length);
  assert.ok(out.tracks.every((t) => t.clips.every((c) => !c.text?.content)));
  // The sound clip of a pair carries the voice; its picture stays as it was.
  assert.equal(out.tracks[1].clips[0].captions.on, true);
  assert.equal('captions' in out.tracks[0].clips[0], false);
  assert.equal(out.tracks[0].clips[0].linkedClipId, out.tracks[1].clips[0].clipId);
  // Music is not speech, and nothing is said about a style nobody asked for.
  assert.equal('captions' in out.tracks[2].clips[0], false);
  assert.equal(result.document, undefined);
  assert.equal(out.captions, undefined);
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
  // A reply that names no preset, or no model at all: captions go on, the style stays.
  fake.setReply(() => '{"preset": "comic"}');
  const odd = await run(edl, directive, { llmUrl: fake.url });
  assert.match(odd.result.notes.join(' '), /could not choose a look \(its reply named none/);
  assert.equal(odd.out.captions, undefined);
  assert.deepEqual(captioned(odd.out), ['interview.mp4', 'voice.wav']);
  const off = await run(edl, directive);
  assert.match(off.result.notes.join(' '), /could not choose a look \(.*LLM_PROVIDER=none/);
  // Not asked for: the model is left alone even when it is there.
  await run(edl, { prompt: directive.prompt }, { llmUrl: fake.url });
  assert.equal(fake.requests.length, before + 2);
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
  assert.equal(more.result.summary, 'Captions switched on for 1 clip (Clean)');
  assert.match(more.result.notes[0], /1 clip already had captions switched on/);
  const again = await run(more.out);
  assert.equal(again.result.summary, 'Captions were already on for 2 clips (Clean)');
  const restyled = await run(more.out, { prompt: 'karaoke' });
  assert.equal(restyled.result.summary, 'Captions were already on — the style is now Karaoke');
  assert.equal(restyled.out.captions.style.preset, 'karaoke');
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
