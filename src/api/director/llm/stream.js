/**
 * Streaming plumbing for the LLM client: line reader and a watchdog that
 * merges cancellation, an overall deadline and an idle timeout.
 * @module api/director/llm/stream
 */

/**
 * Yield the text lines of a streamed HTTP response. A line split across
 * network chunks is reassembled before it is yielded.
 * @param {{ body: any }} res - fetch Response
 * @returns {AsyncGenerator<string>}
 */
export async function* readLines(res) {
  if (!res.body) return;
  const decoder = new TextDecoder();
  let pending = '';
  for await (const chunk of res.body) {
    pending += decoder.decode(chunk, { stream: true });
    let newline = pending.indexOf('\n');
    while (newline >= 0) {
      yield pending.slice(0, newline).replace(/\r$/, '');
      pending = pending.slice(newline + 1);
      newline = pending.indexOf('\n');
    }
  }
  pending += decoder.decode();
  if (pending) yield pending;
}

/**
 * @typedef {Object} Watchdog
 * @property {AbortSignal} signal - Pass to fetch
 * @property {() => void} touch - Call on every sign of life from the server
 * @property {() => void} done - Always call when finished
 * @property {() => ''|'aborted'|'timeout'|'idle'} reason - Why it fired, '' if it has not
 */

/**
 * Abort a request when the caller cancels, when it runs past `timeoutMs`
 * overall, or when nothing arrives for `idleMs`.
 * @param {{ signal?: AbortSignal, timeoutMs: number, idleMs: number }} opts
 * @returns {Watchdog}
 */
export function watchdog({ signal, timeoutMs, idleMs }) {
  const controller = new AbortController();
  /** @type {''|'aborted'|'timeout'|'idle'} */
  let reason = '';
  const fire = (/** @type {'aborted'|'timeout'|'idle'} */ why) => {
    if (reason) return;
    reason = why;
    controller.abort();
  };
  const onAbort = () => fire('aborted');
  if (signal?.aborted) onAbort();
  else signal?.addEventListener('abort', onAbort, { once: true });
  const total = setTimeout(() => fire('timeout'), timeoutMs);
  let idle = setTimeout(() => fire('idle'), idleMs);
  return {
    signal: controller.signal,
    touch() {
      clearTimeout(idle);
      idle = setTimeout(() => fire('idle'), idleMs);
    },
    done() {
      clearTimeout(total);
      clearTimeout(idle);
      signal?.removeEventListener('abort', onAbort);
    },
    reason: () => reason,
  };
}
