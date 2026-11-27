import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createLlmClient } from '../llm/client.js';
import { startFakeLlm } from '../testing/fakeLlm.js';
import { correctionPrompt, requestPlan } from './request.js';

let fake;
before(async () => {
  fake = await startFakeLlm();
});
after(() => fake.close());
const ask = (extra = {}) => {
  const llm = createLlmClient({
    provider: 'ollama',
    url: fake.url,
    model: 'test-model',
    apiKey: '',
  });
  const logs = [];
  return requestPlan({ llm, system: 'SYS', user: 'USER', log: (m) => logs.push(m), ...extra }).then(
    (out) => ({ ...out, logs }),
  );
};

test('requestPlan: a good first reply needs one call, in JSON mode', async () => {
  fake.setReply(() => '{"picks":[{"file":"m1"}]}');
  const before = fake.requests.length;
  const out = await ask();
  assert.deepEqual([out.attempts, out.notes, fake.requests.length - before], [1, [], 1]);
  assert.equal(fake.requests.at(-1).body.format, 'json');
  assert.deepEqual(
    fake.requests.at(-1).body.messages.map((m) => m.role),
    ['system', 'user'],
  );
});

test('requestPlan: an invalid reply is retried once with the errors fed back', async () => {
  fake.setReply((req) =>
    req.body.messages.length === 2
      ? 'Sure! {"picks":[{"start":"later"}]}'
      : '{"picks":[{"file":"m2"}]}',
  );
  const out = await ask();
  assert.equal(out.attempts, 2);
  assert.deepEqual(out.plan, { picks: [{ file: 'm2' }] });
  assert.match(
    out.notes[0],
    /first plan was rejected \(picks\[0\] must have required property 'file'\)/,
  );
  assert.match(out.logs[0], /asking the model to correct it/);
  const retry = fake.requests.at(-1).body.messages;
  assert.deepEqual(
    retry.map((m) => m.role),
    ['system', 'user', 'assistant', 'user'],
  );
  assert.match(retry[2].content, /"start":"later"/);
  assert.match(retry[3].content, /- picks\[0\] must have required property 'file'/);
  assert.match(retry[3].content, /- picks\[0\]\.start must be number/);
});

test('requestPlan: the extra check also triggers the retry', async () => {
  fake.setReply((req) =>
    req.body.messages.length === 2 ? '{"picks":[{"file":"m77"}]}' : '{"picks":[{"file":"m1"}]}',
  );
  const check = (plan) => (plan.picks.some((p) => p.file === 'm1') ? [] : ['use m1']);
  const out = await ask({ check });
  assert.equal(out.attempts, 2);
  assert.match(fake.requests.at(-1).body.messages[3].content, /- use m1/);
});

test('requestPlan: after a failed retry the valid picks are salvaged', async () => {
  fake.setReply(() => '{"picks":[{"file":"m1","segments":[1,2]},{"file":"m2","start":"soon"}]}');
  const out = await ask();
  assert.deepEqual(out.plan.picks, [{ file: 'm1', segments: [1, 2] }]);
  assert.equal(out.notes.length, 2);
  assert.match(out.notes[1], /Dropped from the plan — pick 2: start must be number/);
});

test('requestPlan: two useless replies end in a 502 that says why', async () => {
  fake.setReply(() => 'I am sorry, I cannot produce JSON today.');
  const before = fake.requests.length;
  await assert.rejects(ask(), { status: 502, detail: /no JSON object/ });
  assert.equal(fake.requests.length - before, 2, 'exactly one retry');
});

test('correctionPrompt lists the errors and asks for JSON only', () => {
  const text = correctionPrompt(['picks[0].start must be number', 'use m1']);
  assert.match(
    text,
    /^That reply could not be used as an edit plan:\n- picks\[0\]\.start must be number\n- use m1\n/,
  );
  assert.match(text, /ONE corrected JSON object/);
});
