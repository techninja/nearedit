/**
 * Which director actions can run with the providers this server has, and
 * how to say why one cannot. Pure.
 * @module utils/directorUi/availability
 */

/**
 * @typedef {{ available: boolean, provider?: string, model?: string, detail?: string }} LlmStatus
 */

/**
 * Why the language model cannot be used, for people.
 * @param {LlmStatus} llm
 * @returns {string}
 */
export function llmProblem(llm) {
  const off = !llm.provider || llm.provider === 'none';
  if (off) return 'No language model is set up on this server (LLM_PROVIDER is “none”).';
  const which = [llm.provider, llm.model].filter(Boolean).join(' · ');
  return `The language model (${which}) cannot be reached${llm.detail ? `: ${llm.detail}` : ''}.`;
}

/** Where setting up the LLM is documented. */
export const LLM_DOCS = 'docs/app-spec/CONFIGURATION.md § Director LLM';

/**
 * Whether an action can be picked.
 * @param {{ llm: 'no'|'yes'|'optional', noLlmNote?: string }} action
 * @param {LlmStatus|null} llm - null while the status is unknown: nothing is blocked on a guess
 * @returns {{ enabled: boolean, note: string }} `note` explains a disabled action, or what an
 *   optional LLM would add
 */
export function actionState(action, llm) {
  if (action.llm === 'no' || !llm || llm.available) return { enabled: true, note: '' };
  if (action.llm === 'yes') return { enabled: false, note: llmProblem(llm) };
  const note =
    action.noLlmNote || 'Works by keyword matching; the language model is not available.';
  return { enabled: true, note };
}

/**
 * Whether a field must be disabled because it needs the LLM.
 * @param {string} key - Field key
 * @param {LlmStatus|null} llm
 * @returns {boolean}
 */
export function fieldBlocked(key, llm) {
  return key === 'useLlm' && Boolean(llm) && !llm.available;
}
