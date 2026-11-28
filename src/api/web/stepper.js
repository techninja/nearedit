/**
 * The clock of a recording. A page has two clocks: its own (timers,
 * `Date`, `performance.now()`), which the recorder advances exactly one
 * frame at a time ("virtual time"), and the frame clock (animation frames,
 * CSS transitions and animations), which is the time written on each frame
 * the recorder asks for. The stepper moves both by the same amount and
 * keeps them equal, so a 300 ms transition takes nine frames at 30 fps
 * however long the capture takes.
 *
 * While requests are in flight the page's clock waits: the recording shows
 * a site that answers instantly. A request that never finishes holds it for
 * `WATCHDOG` of real time, once.
 * @module api/web/stepper
 */

/** Real milliseconds without any network activity before the clock stops waiting. */
export const WATCHDOG = 5000;
/** Real milliseconds one frame may wait for the network in all (a slow page that keeps loading). */
const LONGEST_WAIT = 60_000;
/** After this many cut waits the clock no longer waits for the network at all. */
const MAX_STRIKES = 3;
const HANG = 30_000;
const SLACK = 0.5;
const sleep = (/** @type {number} */ ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * @typedef {Object} Stepper
 * @property {(shot?: boolean, flush?: boolean) => Promise<string>} frame - Advance one frame
 *   and draw it; with `shot`, the PNG as base64 ('' when the browser gave none). `flush`: a
 *   button or a key was just sent (see `flushInput`)
 * @property {(drift: number) => Promise<void>} sync - Make the two clocks equal again; `drift`
 *   is how far the frame clock is ahead of the page's, as the page measured it
 * @property {() => void} arrived - A page the recorder navigated to has just been committed
 * @property {number} interval - Milliseconds per frame
 */

/**
 * @param {import('./cdp.js').Session} session
 * @param {import('./network.js').NetworkWatch} network
 * @param {{ fps: number, warn: (message: string) => void, watchdog?: number }} options
 * @returns {Promise<Stepper>} With the page's clock stopped
 */
export async function createStepper(session, network, { fps, warn, watchdog = WATCHDOG }) {
  const interval = 1000 / fps;
  const stuck = new Set();
  let strikes = 0;
  /** Milliseconds the frame clock still has to make up at the next frame. */
  let behind = 0;
  // The frame clock counts in the browser's own monotonic clock; real time
  // is only ever measured as a difference from this first reading.
  const { virtualTimeTicksBase } = await session.send('Emulation.setVirtualTimePolicy', {
    policy: 'pause',
  });
  const startedAt = performance.now();
  const realNow = () => virtualTimeTicksBase + (performance.now() - startedAt) + 50;
  let tick = realNow();

  /** @type {(budget: number, policy: string) => Promise<any>} Resolves when the budget is used up. */
  const grant = async (budget, policy) => {
    const used = session.wait('Emulation.virtualTimeBudgetExpired', {
      timeout: HANG + LONGEST_WAIT,
    });
    used.catch(() => {}); // reported through the command below when the browser is gone
    await session.send('Emulation.setVirtualTimePolicy', { policy, budget });
    return used;
  };
  const waiting = () => [...network.inflight.keys()].filter((id) => !stuck.has(id));

  /** Stop waiting for whatever is still in flight. */
  const strike = () => {
    strikes++;
    for (const [id, url] of network.inflight) {
      if (!stuck.has(id)) warn(`${url} did not finish loading; the clock stopped waiting for it`);
      stuck.add(id);
    }
    if (strikes === MAX_STRIKES)
      warn('The page keeps requests open; the clock no longer waits for the network');
  };

  /** Let the page's clock run for one frame. */
  const advance = async () => {
    const patient = strikes < MAX_STRIKES && (strikes === 0 || waiting().length > 0);
    if (!patient) return void (await grant(interval, 'advance'));
    const began = Date.now();
    let used = false;
    const done = grant(interval, 'pauseIfNetworkFetchesPending').then(() => (used = true));
    done.catch(() => {});
    while (!used) {
      await Promise.race([done, sleep(50)]);
      if (used) break;
      const held = Date.now() - began;
      const cut = held >= LONGEST_WAIT || (held >= watchdog && network.idleFor() >= watchdog);
      // After a cut, requests known to be stuck are no reason to wait again.
      if (!cut && !(strikes > 0 && waiting().length === 0 && held > 200)) continue;
      if (cut) strike();
      await grant(interval, 'advance');
      break;
    }
    await done;
  };

  /**
   * After a click or a key Chrome holds back a page's other work — the
   * answer to a request the click started among it — until a frame has been
   * drawn. Waiting for that request first would wait for ever: draw a frame
   * that is not kept, a hair after the last one, and wait then.
   */
  const flushInput = () =>
    session.send('HeadlessExperimental.beginFrame', { frameTimeTicks: tick + 0.1, interval }, HANG);

  return {
    interval,
    async frame(shot = false, flush = false) {
      if (flush) await flushInput();
      await advance();
      tick += interval + behind;
      behind = 0;
      const { screenshotData } = await session.send(
        'HeadlessExperimental.beginFrame',
        {
          ...{ frameTimeTicks: tick, interval },
          ...(shot && { screenshot: { format: 'png', optimizeForSpeed: true } }),
        },
        HANG,
      );
      return screenshotData || '';
    },
    async sync(drift) {
      if (!Number.isFinite(drift) || Math.abs(drift) < SLACK) return;
      // The frame clock may only move forward: when it is ahead, the page's clock catches up.
      if (drift < 0) behind += -drift;
      else await grant(drift, 'advance');
    },
    arrived() {
      // A document's animations are frozen by a frame dated before it began.
      tick = Math.max(tick, realNow());
    },
  };
}
