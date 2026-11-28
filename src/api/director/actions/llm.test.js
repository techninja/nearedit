import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { makeContext } from '../testing/context.js';
import { startFakeLlm } from '../testing/fakeLlm.js';
import { checkResult } from '../testing/invariants.js';
import { createParkProject } from '../testing/park.js';
import { generateEdit } from './generateEdit.js';
import { executeScript, generateScripts } from './scripts.js';

// Handles in the park project: m1 beach, m2 city, m3 interview, m4 music,
// m5 sign.png, m6 tall.png, m7 voice-memo.wav, m8 voice.wav.
const GOOD_PLAN = {
  rationale: 'Interview first, then the voice-over with pictures.',
  title: 'Park Day',
  music: { file: 'm4' },
  picks: [
    { file: 'm3', role: 'primary', segments: [1, 2], note: 'arrival' },
    { file: 'm8', role: 'narration', segments: [1, 2], visuals: ['m1', 'm5'] },
    { file: 'm2', role: 'broll', start: 0.5, end: 3.2, title: 'Downtown' },
  ],
};
const CHATTY = [
  '<think>\nThe user wants a highlight reel. Draft: {"picks": []} — no, more.\n</think>',
  'Sure! Here is the edit plan:',
  '```json',
  JSON.stringify(
    { ...GOOD_PLAN, picks: [...GOOD_PLAN.picks, { file: 'drone.mp4', role: 'broll' }] },
    null,
    2,
  ),
  '```',
  'I chose these because they fit the request. Let me know if you would like changes!',
].join('\n');

let fake;
let park;
before(async () => {
  fake = await startFakeLlm();
  park = await createParkProject();
});
after(async () => {
  await fake.close();
  park.cleanup();
});

const ctxFor = (directive, extra = {}) =>
  makeContext(park, directive, { llmUrl: fake.url, ...extra });
function check(result, ctx) {
  const durations = Object.fromEntries(ctx.media.map((m) => [m.filePath, m.duration]));
  assert.deepEqual(checkResult(result, { fps: 30, durations, roots: [park.dir] }), []);
}
const EDIT = {
  action: 'generate_edit',
  prompt: 'a short film about the park',
  params: { duration: 15 },
};

test('generate_edit: an over-talkative reply still becomes a valid fragment', async () => {
  fake.setReply(() => CHATTY);
  const ctx = await ctxFor(EDIT);
  const result = await generateEdit(ctx);
  check(result, ctx);
  assert.equal(result.mode, 'replace');
  assert.match(
    result.summary,
    /^\d+ clips, 1\d(\.\d)?s, cut on the beat at 120 BPM, 2 brand elements$/,
  );
  assert.match(result.notes.join('\n'), /Pick 4: unknown file "drone\.mp4" — dropped/);
  assert.deepEqual(
    result.plan.picks.map((p) => [p.file, p.role]),
    [
      ['m3', 'primary'],
      ['m8', 'narration'],
      ['m2', 'broll'],
    ],
  );
  assert.equal(result.plan.rationale, GOOD_PLAN.rationale);
  assert.deepEqual(
    result.markers.map((m) => [m.time, m.label]),
    [[0, 'arrival']],
  );
  const byName = Object.fromEntries(result.tracks.map((t) => [t.name, t.clips]));
  assert.equal(byName.Main.filter((c) => c.sourceFile.endsWith('interview.mp4')).length, 2);
  assert.ok(byName['B-roll'].some((c) => c.sourceFile.endsWith('sign.png')));
  assert.equal(byName.Music.length, 1);
  assert.ok(ctx.logs.some((l) => /Asking test-model for an edit plan/.test(l)));
  assert.ok(ctx.logs.some((l) => /Plan received: 4 picks/.test(l)));
});

test('generate_edit: the prompt carries the digest and request, and no canned content', async () => {
  fake.setReply(() => JSON.stringify(GOOD_PLAN));
  const directive = { ...EDIT, params: { duration: 45, style: 'trailer', pacing: 'fast' } };
  await generateEdit(await ctxFor(directive));
  const [system, user] = fake.requests.at(-1).body.messages.map((m) => m.content);
  assert.equal(fake.requests.at(-1).body.format, 'json');
  assert.match(system, /Reply with ONE JSON object/);
  assert.match(system, /role "narration": only the voice is used/);
  assert.match(user, /^MEDIA\nm1 video "broll\/beach\.mp4" 8\.0s 320x180 with sound \[picture\]/);
  assert.match(user, /m3 video "interview\.mp4".*\[speech\]/);
  assert.match(user, /s2 \[6\.6-9\.3\] the dog ran straight to the beach/);
  assert.match(user, /m4 audio "music\/bed\.wav" 30\.0s \[music\] 120 bpm/);
  assert.match(user, /TIMELINE\nMain Edit: 1920x1080 \(16:9, landscape\), 30 fps\./);
  assert.match(
    user,
    /Target length: about 45 seconds\.\nStyle: trailer\.\nPacing: fast \(picture shots of about 2 seconds\)/,
  );
  assert.match(user, /What the editor asked for: a short film about the park/);
  assert.doesNotMatch(system + user, /audience|lecture|philosoph|first ~30s|\/tmp\//i);
});

test('generate_edit works over an OpenAI-compatible server too', async () => {
  fake.setReply(() => CHATTY);
  const ctx = await ctxFor(EDIT, { provider: 'openai' });
  const result = await generateEdit(ctx);
  check(result, ctx);
  assert.equal(fake.requests.at(-1).path, '/v1/chat/completions');
  assert.equal(result.plan.picks.length, 3);
});

test('generate_edit: a plan of invented files is sent back once, then used', async () => {
  fake.setReply((req) =>
    req.body.messages.length === 2
      ? '{"picks":[{"file":"sunset.mp4"},{"file":"/etc/passwd","role":"primary"}]}'
      : JSON.stringify(GOOD_PLAN),
  );
  const ctx = await ctxFor(EDIT);
  const result = await generateEdit(ctx);
  check(result, ctx);
  const correction = fake.requests.at(-1).body.messages[3].content;
  assert.match(
    correction,
    /none of the picks names a file from the media list — use the handles m1 to m8/,
  );
  assert.match(result.notes.join('\n'), /first plan was rejected/);
  for (const track of result.tracks)
    for (const clip of track.clips)
      assert.ok(!clip.sourceFile || clip.sourceFile.startsWith(park.dir));
});

test('generate_edit: invented files twice is an error, never a made-up clip', async () => {
  fake.setReply(() => '{"picks":[{"file":"sunset.mp4"}]}');
  await assert.rejects(generateEdit(await ctxFor(EDIT)), {
    status: 502,
    detail: /none of the picks names a file/,
  });
});

test('generate_edit: says so when the plan misses the target length', async () => {
  fake.setReply(() => JSON.stringify(GOOD_PLAN));
  const result = await generateEdit(await ctxFor({ ...EDIT, params: { duration: 120 } }));
  assert.match(result.notes.at(-1), /The edit runs 1\d(\.\d)?s against a target of 2m 00s/);
});

test('LLM actions fail clearly when the server is unreachable or cancelled', async () => {
  const dead = await makeContext(park, EDIT, { llmUrl: 'http://127.0.0.1:9' });
  await assert.rejects(generateEdit(dead), {
    status: 503,
    message: /Cannot reach the ollama LLM server/,
  });
  const none = await makeContext(park, EDIT);
  await assert.rejects(generateEdit(none), { status: 503, message: /LLM_PROVIDER=none/ });
  fake.setReply(() => ({ content: 'slow start', stall: true }));
  const controller = new AbortController();
  const pending = generateEdit(await ctxFor(EDIT, { signal: controller.signal }));
  setTimeout(() => controller.abort(), 50);
  await assert.rejects(pending, { name: 'AbortError' });
});

const SCRIPT =
  '# Edit script: Park\n\n## Sequence\n\n### 1. Arrival\n- Source: m3 "interview.mp4", segments 1-2\n- Role: primary\n';

test('generate_script: N cleaned Markdown options saved under scripts/', async () => {
  fake.setReply(
    (req) =>
      `<think>angle…</think>Here you go:\n\n\`\`\`markdown\n${SCRIPT}\n(option ${req.n})\n\`\`\``,
  );
  const before = fake.requests.length;
  const ctx = await ctxFor({
    action: 'generate_script',
    prompt: 'recap',
    params: { variants: 3, duration: 30 },
  });
  const out = await generateScripts(ctx);
  assert.equal(out.count, 3);
  assert.equal(out.folder, join(park.dir, 'scripts', 'main-edit'));
  assert.match(out.summary, /^3 script options saved to /);
  out.scripts.forEach((s, i) => {
    assert.equal(s.variant, i + 1);
    assert.match(s.filename, /^\d{8}-\d{4}-option-\d\.md$/);
    assert.ok(s.script.startsWith('# Edit script: Park'), s.script.slice(0, 40));
    assert.doesNotMatch(s.script, /think|```|Here you go/);
    assert.equal(readFileSync(s.filePath, 'utf-8'), s.script);
  });
  const prompts = fake.requests.slice(before).map((r) => r.body.messages[1].content);
  assert.equal(new Set(prompts.map((p) => p.match(/Angle for this option: (.*)/)[1])).size, 3);
  assert.match(prompts[0], /^MEDIA\nm1 video/);
  assert.equal(fake.requests.at(-1).body.format, undefined, 'scripts are Markdown, not JSON mode');
  assert.doesNotMatch(
    fake.requests.at(-1).body.messages[0].content,
    /audience|lecture|philosoph|poetic/i,
  );
  // A second run never overwrites the first.
  const again = await generateScripts(ctx);
  assert.equal(readdirSync(out.folder).length, 6);
  assert.ok(again.scripts.every((s) => existsSync(s.filePath)));
});

test('generate_script: an empty reply is reported, all empty is an error', async () => {
  fake.setReply((req) => (req.n % 2 ? '' : SCRIPT));
  const ctx = await ctxFor({ action: 'generate_script', params: { variants: 2 } });
  const first = fake.requests.length % 2;
  const out = await generateScripts(ctx);
  assert.equal(out.count, 1);
  assert.match(out.notes.join(' '), /Option [12]: the model returned nothing usable/);
  assert.ok(first === 0 || first === 1);
  fake.setReply(() => '   ');
  await assert.rejects(generateScripts(ctx), { status: 502 });
});

test('execute_script: the approved script becomes a plan and a fragment', async () => {
  fake.setReply(() => JSON.stringify(GOOD_PLAN));
  const ctx = await ctxFor({ action: 'execute_script', prompt: SCRIPT, mode: 'append' });
  const result = await executeScript(ctx);
  check(result, ctx);
  assert.equal(result.mode, 'append');
  assert.match(result.summary, /^From script: \d+ clips/);
  const user = fake.requests.at(-1).body.messages[1].content;
  assert.match(user, /APPROVED SCRIPT\n# Edit script: Park/);
  assert.match(user, /Follow it exactly/);
  // From a saved file.
  const saved = (
    await generateScripts(await ctxFor({ action: 'generate_script', params: { variants: 1 } }))
  ).scripts[0];
  fake.setReply(() => JSON.stringify(GOOD_PLAN));
  const fromFile = await ctxFor({
    action: 'execute_script',
    params: { scriptPath: saved.filePath },
  });
  check(await executeScript(fromFile), fromFile);
});

test('execute_script refuses a missing script and paths outside the project', async () => {
  const none = await ctxFor({ action: 'execute_script' });
  await assert.rejects(executeScript(none), { status: 422, message: /No script/ });
  const outside = await ctxFor({
    action: 'execute_script',
    params: { scriptPath: '/etc/hostname' },
  });
  await assert.rejects(executeScript(outside), { status: 403 });
  const media = await ctxFor({
    action: 'execute_script',
    params: { scriptPath: park.paths['voice.wav'] },
  });
  await assert.rejects(executeScript(media), (err) => {
    assert.equal(err.status, 422);
    assert.match(err.fields['params.scriptPath'], /\.md or \.txt/);
    return true;
  });
});
