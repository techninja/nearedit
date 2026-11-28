import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { builtinKit, normalizeKit, resolveKit } from '#utils/brand/index.js';
import { applyDirected } from '#utils/director/applyResult.js';
import { normalizeDirective } from '#utils/director/directive.js';
import { createEdl, elementClips, validateEdl } from '#utils/edl/index.js';
import { createLlmClient } from '../llm/client.js';
import { motionPrompt } from '../prompts/motion.js';
import { scorePrompt } from '../prompts/score.js';
import { fakeRenderer } from '../score/testing/renderer.js';
import { makeContext } from '../testing/context.js';
import { checkResult } from '../testing/invariants.js';
import { createParkProject } from '../testing/park.js';
import { clip, doc, pair } from '../testing/timeline.js';
import { fakeRecorder } from '../web/testing/fakeRecorder.js';
import { demoContext } from '../web/testing/kit.js';
import { motionPiece } from './motion.js';
import { score } from './score.js';
import { siteDemo } from './siteDemo.js';

const kitOf = (id) => resolveKit(builtinKit(id));
const FACE = { family: 'Acme Sans', weight: 700, file: '/nowhere/AcmeSans-Bold.ttf' };
/** A kit of its own: colours, a font file, a sound the director writes. */
const acme = resolveKit([
  normalizeKit({
    ...{ id: 'acme', name: 'Acme', extends: 'builtin:clean', fonts: [FACE] },
    tokens: {
      color: { background: '#07102a', primary: '#ff6b2c', accent: '#35d0ff' },
      font: { heading: { family: 'Acme Sans', weight: 700 } },
      sound: { style: 'lo-fi', key: 'A', scale: 'minor' },
    },
  }),
]);
let park;
before(async () => {
  park = await createParkProject();
});
after(() => park?.cleanup());

const BRIEF =
  'Made from nothing | no footage\nEvery number can move\nChapter: How it works\nStart here';
/** A motion-piece context without a project, in a kit. */
function motionCtx(kit, params = {}, prompt = BRIEF) {
  const normal = normalizeDirective({ action: 'motion_piece', prompt, params });
  assert.equal(normal.ok, true);
  return /** @type {any} */ ({
    ...{
      projectId: 'none',
      projectDir: '/nowhere',
      directive: normal.directive,
      edl: null,
      media: [],
    },
    format: { fps: 30, width: 1920, height: 1080, aspectRatio: '16:9', name: 'Main Edit' },
    llm: createLlmClient({ provider: 'none', url: 'http://127.0.0.1:9', model: 'm', apiKey: '' }),
    ...(kit && { kit }),
    progress: () => {},
    log: () => {},
  });
}
const withoutIds = (value) =>
  JSON.parse(JSON.stringify(value, (key, v) => (/^(clip|marker)Id$/.test(key) ? '' : v)));

test('motion piece: on brand by default — the kit’s theme, its intro, chapter and outro', async () => {
  const result = await motionPiece(motionCtx(kitOf('bold')));
  assert.deepEqual(checkResult(result, { fps: 30 }), []);
  assert.equal(result.plan.theme, 'brand');
  assert.deepEqual(
    result.plan.scenes.map((scene) => [scene.kind || 'scene', scene.number || '']),
    [
      ['intro', ''],
      ['scene', ''],
      ['chapter', '01'],
      ['outro', ''],
    ],
  );
  const merged = applyDirected(createEdl(), result);
  assert.deepEqual(validateEdl(merged).problems, []);
  const cards = elementClips(merged)
    .map(({ clip: c }) => c)
    .sort((a, b) => a.timelineStart - b.timelineStart)
    .map((c) => [c.element.id, c.element.slots]);
  assert.deepEqual(cards, [
    ['intro', { title: 'Made from nothing', subtitle: 'no footage' }],
    ['chapter', { title: 'How it works', number: '01' }],
    ['outro', { title: 'Start here', text: '' }],
  ]);
  // The ordinary scene: a title in the kit's heading font, set in capitals, on its colours.
  const [title] = result.tracks.find((t) => t.name === 'Titles').clips;
  assert.deepEqual(
    [title.text.content, title.text.fontFamily, title.text.color],
    ['EVERY NUMBER CAN MOVE', 'Bebas Neue', '#ffffff'],
  );
  assert.deepEqual(result.markers.map((m) => m.label)[1], 'Every number can move');
  assert.match(
    result.summary,
    /^Motion piece “Bold”: 4 scenes, .* — spotlight background, 3 brand cards$/,
  );
  assert.match(
    result.notes.join('\n'),
    /On brand: the colours, fonts and motion of the kit “Bold”/,
  );
  assert.match(
    result.notes.join('\n'),
    /scene 1 its intro, scene 3 its chapter, scene 4 its outro/,
  );
  assert.equal(result.document, undefined, 'bundled fonts need no font file');
});

test('motion piece: the same request and kit give the same piece; another kit, another', async () => {
  const one = await motionPiece(motionCtx(kitOf('playful')));
  assert.deepEqual(withoutIds(await motionPiece(motionCtx(kitOf('playful')))), withoutIds(one));
  assert.notDeepEqual(withoutIds(await motionPiece(motionCtx(kitOf('clean')))), withoutIds(one));
  // Without a kit handed in, the built-in one every chain rests on.
  const bare = await motionPiece(motionCtx(null));
  assert.match(bare.summary, /^Motion piece “Clean”/);
  assert.deepEqual(withoutIds(bare), withoutIds(await motionPiece(motionCtx(kitOf('clean')))));
});

test('motion piece: a named theme leaves the brand; the switches and a font file are honoured', async () => {
  const neon = await motionPiece(motionCtx(kitOf('bold'), { theme: 'neon' }));
  assert.equal(neon.plan.theme, 'neon');
  assert.deepEqual(elementClips(applyDirected(createEdl(), neon)), []);
  assert.match(
    neon.notes.join('\n'),
    /Opening, chapter and closing cards are drawn by the brand kit/,
  );
  const plain = await motionPiece(motionCtx(kitOf('bold'), { bumpers: false }));
  assert.deepEqual(
    plain.plan.scenes.map((s) => s.kind || 'scene'),
    ['scene', 'scene', 'chapter', 'scene'],
  );
  // Two lines: an opening and a scene. One line: a scene.
  const two = await motionPiece(motionCtx(kitOf('clean'), {}, 'Hello\nWorld'));
  assert.deepEqual(
    two.plan.scenes.map((s) => s.kind || 'scene'),
    ['intro', 'scene'],
  );
  const one = await motionPiece(motionCtx(kitOf('clean'), {}, 'Hello'));
  assert.deepEqual(
    one.plan.scenes.map((s) => s.kind || 'scene'),
    ['scene'],
  );
  // A kit with a font of its own: the titles name it and the result brings its file.
  const own = await motionPiece(motionCtx(acme));
  assert.deepEqual(own.document, { fonts: [{ ...FACE, style: 'normal' }] });
  const merged = applyDirected(createEdl(), own);
  assert.deepEqual(validateEdl(merged).problems, []);
  const titles = merged.tracks.flatMap((t) => t.clips).filter((c) => c.text.content);
  assert.deepEqual([...new Set(titles.map((c) => c.text.fontFamily))], ['Acme Sans']);
  assert.deepEqual(merged.fonts, [{ ...FACE, style: 'normal' }]);
  // The prompt tells a model that the brand decides the look.
  const ctx = motionCtx(acme);
  const asked = motionPrompt({ directive: ctx.directive, format: ctx.format, brand: 'Acme' }).user;
  assert.match(
    asked,
    /Theme: the brand kit “Acme” decides colours, type and motion\. Do not choose/,
  );
});

/** Interview 0–8 and city 8–12 with the voice-over under it. */
function talk() {
  const [video, audio] = pair(park.paths['interview.mp4'], 0, 8, 0);
  return doc({
    video: [[video, clip(park.paths['broll/city.mp4'], 1, 5, 8)]],
    audio: [[audio, clip(park.paths['voice.wav'], 0, 4, 8)]],
  });
}
const scored = async (kit, directive = {}) =>
  score(
    await makeContext(park, { action: 'score', ...directive }, { edl: talk(), kit }),
    fakeRenderer(),
  );

test('score: the style and the key of the kit, unless the request says otherwise', async () => {
  const doc1 = await scored(kitOf('documentary'));
  assert.deepEqual([doc1.plan.style, doc1.plan.key, doc1.plan.scale], ['cinematic', 'D', 'minor']);
  assert.match(doc1.summary, /^Score: Cinematic in D minor/);
  const notes = doc1.notes.join('\n');
  assert.match(notes, /Style Cinematic — the musical style of the brand kit “Documentary”\./);
  assert.match(notes, /Key D: the brand kit’s \(“Documentary”\)\./);
  const playful = await scored(kitOf('playful'));
  assert.deepEqual([playful.plan.style, playful.plan.key], ['bossa', 'G']);
  assert.deepEqual(
    (await scored(kitOf('playful'))).plan,
    playful.plan,
    'the same kit, the same music',
  );
  // The form names a style: it wins; the key is still the brand's until the form names one.
  const house = await scored(kitOf('documentary'), { params: { style: 'house' } });
  assert.deepEqual([house.plan.style, house.plan.key], ['house', 'D']);
  const keyed = await scored(kitOf('documentary'), { params: { key: 'F#' } });
  assert.deepEqual([keyed.plan.style, keyed.plan.key], ['cinematic', 'F#']);
  // The brief names a style: the brand's steps back. `auto` leaves the brand altogether.
  const brief = await scored(kitOf('documentary'), { prompt: 'something lo-fi, calm' });
  assert.equal(brief.plan.style, 'lofi');
  assert.match(
    brief.notes.join('\n'),
    /Style Lo-fi — the brief names it, so the brand’s style steps back/,
  );
  const auto = await scored(kitOf('documentary'), { params: { style: 'auto', key: 'auto' } });
  assert.equal(auto.plan.style, 'lofi', 'a slow timeline with speech');
  assert.doesNotMatch(auto.notes.join('\n'), /brand kit/);
});

test('score: a style is written in one scale — the kit’s scale is said, not forced', async () => {
  // Lo-fi is written in dorian; this kit asks for minor.
  const mixed = await scored(acme);
  assert.deepEqual([mixed.plan.style, mixed.plan.key, mixed.plan.scale], ['lofi', 'A', 'dorian']);
  assert.match(
    mixed.notes.join('\n'),
    /The kit asks for the minor scale; Lo-fi is written in dorian, and keeps it/,
  );
  // A style the director does not write: the timeline chooses among those of the kit's scale.
  const odd = resolveKit([
    normalizeKit({ id: 'odd', name: 'Odd', tokens: { sound: { style: 'polka', scale: 'minor' } } }),
  ]);
  const other = await scored(odd);
  assert.equal(other.plan.scale, 'minor');
  assert.match(
    other.notes.join('\n'),
    /the kit “Odd” asks for “polka”, which the director does not write/,
  );
  const ctx = await makeContext(park, { action: 'score' }, { edl: talk(), kit: acme });
  const seen = { seconds: 12, what: 'the whole timeline', cutsPerMinute: 5, points: [] };
  const sound =
    'Brand: the kit “Acme” sounds like lofi. Use that style unless the request asks for another.';
  const speech = { spans: [], spoken: 0, clips: 0, notes: [] };
  const asked = scorePrompt({
    directive: ctx.directive,
    format: ctx.format,
    seen: { ...seen, speech },
    sound,
  });
  assert.match(asked.user, /Brand: the kit “Acme” sounds like lofi/);
  assert.doesNotMatch(asked.user, /Key: brand/);
});

test('site demo: the ground, the captions and the card are the kit’s; finished adds outro and bug', async () => {
  const brief =
    '# Tideline | changelogs people read\nclick Yearly | Two months free\nscroll to Pricing | Plans for every team';
  const run = async (kit, params = {}) => {
    const ctx = demoContext(park.dir, { prompt: brief, params: { theme: 'brand', ...params } });
    return siteDemo({ ...ctx, kit }, fakeRecorder());
  };
  const bold = await run(kitOf('bold'));
  assert.deepEqual(checkResult(bold, { fps: 30 }), []);
  assert.equal(bold.plan.theme, 'brand');
  const row = (result, name) => result.tracks.find((t) => t.name === name).clips;
  const shown = row(bold, 'Titles').map((c) => [
    c.element?.id,
    Object.values(c.element?.slots || {})[0],
  ]);
  assert.deepEqual(shown, [
    ['intro', 'Tideline'],
    ['caption', 'Two months free'],
    ['caption', 'Plans for every team'],
  ]);
  assert.deepEqual(row(bold, 'Text'), [], 'the card is one element: no subtitle clip of its own');
  assert.equal(row(bold, 'Page')[0].timelineStart, row(bold, 'Titles')[0].timelineEnd);
  assert.match(bold.summary, /window look, Bold, 2 captions/);
  assert.match(
    bold.notes.join('\n'),
    /On brand: the ground takes the colours of the kit “Bold”; the title card is its intro; the captions are its caption element/,
  );
  // The ground is the kit's own colours.
  const ground = row(bold, 'Background')[0].generator.params;
  const playful = await run(kitOf('playful'));
  assert.notDeepEqual(row(playful, 'Background')[0].generator.params, ground);
  // A finished piece: a row in front with the bug over the recording and the outro after it.
  const done = await run(kitOf('bold'), { finished: true });
  assert.deepEqual(checkResult(done, { fps: 30 }), []);
  assert.equal(done.tracks[0].name, 'Brand');
  const [bug, outro] = done.tracks[0].clips;
  const page = row(done, 'Page')[0];
  assert.deepEqual([bug.element.id, outro.element.id], ['bug', 'outro']);
  assert.equal(bug.timelineStart, page.timelineStart);
  assert.equal(bug.timelineEnd, outro.timelineStart);
  assert.ok(
    outro.timelineStart < page.timelineEnd && outro.fadeIn > 0,
    'the outro arrives over the page',
  );
  assert.deepEqual(outro.element.slots, { title: 'Tideline', text: 'tideline.test' });
  assert.equal(done.duration, outro.timelineEnd);
  assert.deepEqual(validateEdl(applyDirected(createEdl(), done)).problems, []);
  // With a target length the finished piece still ends on it.
  const timed = await run(kitOf('clean'), { finished: true, duration: 30 });
  assert.equal(timed.duration, 30);
  // Another theme: titles as before, and a finished piece is refused in words, not built.
  const paper = await run(kitOf('bold'), { theme: 'paper', finished: true });
  assert.ok(row(paper, 'Titles').every((c) => !c.element));
  assert.match(
    paper.notes.join('\n'),
    /A finished piece — intro, outro and logo — is made with the Brand theme only/,
  );
});
