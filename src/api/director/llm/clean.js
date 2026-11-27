/**
 * Cleaning up what a language model actually sends back: reasoning blocks
 * (`<think>…</think>`, as qwen3 emits), code fences and prose around JSON.
 * @module api/director/llm/clean
 */

const THINK_BLOCK = /<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi;
const THINK_CLOSE = /<\/think(?:ing)?>/gi;
const THINK_OPEN = /<think(?:ing)?>/i;

/**
 * Remove reasoning blocks. Handles a closing tag whose opener was swallowed
 * by the chat template, and an opener that never closes (the model ran out
 * of tokens while thinking).
 * @param {string} text
 * @returns {string}
 */
export function stripReasoning(text) {
  let out = String(text || '').replace(THINK_BLOCK, '');
  let lastClose = -1;
  for (const match of out.matchAll(THINK_CLOSE)) lastClose = match.index + match[0].length;
  if (lastClose >= 0) out = out.slice(lastClose);
  const open = out.search(THINK_OPEN);
  if (open >= 0) out = out.slice(0, open);
  return out.trim();
}

/**
 * End index (exclusive) of the JSON value opening at `start`, honouring
 * strings and escapes; -1 when it never closes.
 * @param {string} text
 * @param {number} start - Index of a `{` or `[`
 * @returns {number}
 */
function balancedEnd(text, start) {
  let depth = 0;
  let inString = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (ch === '\\') i++;
      else if (ch === '"') inString = false;
    } else if (ch === '"') inString = true;
    else if (ch === '{' || ch === '[') depth++;
    else if (ch === '}' || ch === ']') {
      depth--;
      if (depth === 0) return i + 1;
    }
  }
  return -1;
}

/**
 * Candidate JSON snippets in a reply, most likely first: the contents of
 * code fences, then each top-level `{…}`/`[…]` block in the prose. A block
 * that never closes (truncated output) runs to the end of the text.
 * @param {string} reply
 * @param {number} [limit=6]
 * @returns {string[]}
 */
export function jsonCandidates(reply, limit = 6) {
  const text = stripReasoning(reply);
  const sources = [];
  for (const fence of text.matchAll(/```[a-zA-Z0-9]*\s*([\s\S]*?)(?:```|$)/g))
    sources.push(fence[1]);
  sources.push(text);
  const found = [];
  for (const source of sources) {
    let from = 0;
    while (found.length < limit) {
      const open = source.slice(from).search(/[{[]/);
      if (open < 0) break;
      const start = from + open;
      const end = balancedEnd(source, start);
      const snippet = source.slice(start, end < 0 ? undefined : end).trim();
      if (!found.includes(snippet)) found.push(snippet);
      if (end < 0) break;
      from = end;
    }
  }
  return found;
}
