import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { actionState, fieldBlocked, llmProblem } from './availability.js';

describe('availability', () => {
  const off = {
    available: false,
    provider: 'none',
    model: 'qwen3:14b',
    detail: 'disabled (LLM_PROVIDER=none)',
  };
  const down = {
    available: false,
    provider: 'ollama',
    model: 'qwen3:14b',
    detail: 'connection refused',
  };
  const up = { available: true, provider: 'ollama', model: 'qwen3:14b', detail: '' };

  it('explains a missing and an unreachable model differently', () => {
    assert.match(llmProblem(off), /No language model is set up/);
    assert.match(llmProblem(down), /ollama · qwen3:14b.*cannot be reached: connection refused/);
  });

  it('disables only the actions that need the model', () => {
    assert.deepEqual(actionState({ llm: 'no' }, off), { enabled: true, note: '' });
    assert.equal(actionState({ llm: 'yes' }, off).enabled, false);
    assert.match(actionState({ llm: 'yes' }, down).note, /cannot be reached/);
    assert.equal(actionState({ llm: 'optional' }, down).enabled, true);
    assert.match(actionState({ llm: 'optional' }, down).note, /keyword matching/);
  });

  it('blocks nothing while the status is unknown or the model is up', () => {
    assert.equal(actionState({ llm: 'yes' }, null).enabled, true);
    assert.deepEqual(actionState({ llm: 'yes' }, up), { enabled: true, note: '' });
  });

  it('blocks the "let the LLM choose" switch without a model', () => {
    assert.equal(fieldBlocked('useLlm', down), true);
    assert.equal(fieldBlocked('useLlm', up), false);
    assert.equal(fieldBlocked('useLlm', null), false);
    assert.equal(fieldBlocked('duration', down), false);
  });
});
