/**
 * A studio is everything one recording — or one snapshot — runs in: the
 * gate and its proxy, a browser with a fresh profile, the page, and the
 * clock. Opening one starts all of it; `close()` ends all of it, whatever
 * happened in between.
 * @module api/web/studio
 */

import { WebError } from './errors.js';
import { createGate, refusalMessage } from './gate.js';
import { launchBrowser } from './launch.js';
import { startProxy } from './proxy.js';
import { applyStorage } from './storage.js';
import { createStepper } from './stepper.js';
import { openTab } from './tab.js';

/**
 * @typedef {Object} StudioOptions
 * @property {import('#utils/web/types.js').Recipe} recipe - Normalised
 * @property {number} fps
 * @property {string} browser - Path of chrome-headless-shell
 * @property {string|string[]} [allow] - `WEB_CAPTURE_ALLOW`
 * @property {boolean} [noSandbox]
 * @property {string} [setting] - How this caller gives exceptions, for messages (`--allow`)
 * @property {import('./storage.js').Storage|null} [storage]
 * @property {number} [watchdog] - Tests shorten the wait for a request that never finishes
 * @typedef {Object} Studio
 * @property {import('./tab.js').Tab} tab
 * @property {import('./stepper.js').Stepper} stepper
 * @property {(url: string, between?: () => Promise<void>) => Promise<void>} load - Go to a
 *   page and let it settle; `between` runs after every settling frame
 * @property {() => void} check - Throws when the page went somewhere it may not
 * @property {(message: string) => void} warn
 * @property {() => string[]} warnings - Everything worth telling, once each
 * @property {() => Promise<void>} close
 */

/** Seconds of its own time a page is given after loading, before it is shown. */
export const SETTLE_SECONDS = 1;

/**
 * @param {StudioOptions} options
 * @returns {Promise<Studio>}
 * @throws {WebError} When the browser cannot start; nothing is left running
 */
export async function openStudio(options) {
  const { recipe, fps, setting = 'WEB_CAPTURE_ALLOW' } = options;
  const view = { ...recipe.viewport, scale: recipe.scale };
  const gate = createGate({ allow: options.allow });
  const proxy = await startProxy(gate);
  /** @type {import('./launch.js').Browser|null} */
  let browser = null;
  const close = async () => {
    await browser?.close();
    await proxy.close();
  };
  try {
    browser = await launchBrowser({
      ...{ path: options.browser, ...view, noSandbox: options.noSandbox, proxyPort: proxy.port },
    });
    const { connection } = browser;
    const tab = await openTab(connection, { ...view, colorScheme: recipe.colorScheme });
    if (options.storage) await applyStorage(connection, tab, options.storage);
    /** @type {string[]} */
    const said = [];
    const warn = (/** @type {string} */ message) => void said.push(message);
    const stepper = await createStepper(tab.session, tab.network, { ...options, warn });
    tab.session.on('Network.responseReceived', ({ type, frameId, response }) => {
      if (type === 'Document' && frameId === tab.mainFrame() && response.status >= 400)
        warn(`${response.url} answered with HTTP ${response.status}`);
    });
    let checked = 0;

    /** Fail when an address the page itself was sent to was refused or cannot be reached. */
    const check = (extra = '') => {
      const { documents } = tab.network;
      for (const address of [extra, ...documents.slice(checked)].filter(Boolean)) {
        const url = new URL(address);
        const port = Number(url.port) || (url.protocol === 'https:' ? 443 : 80);
        const refusal = gate.refused(url.hostname, port);
        if (refusal) throw new WebError(403, refusalMessage(address, refusal.reason, setting));
        const failure = proxy.failures.get(`${url.hostname}:${port}`.toLowerCase());
        if (failure) throw new WebError(502, `${address} could not be loaded: ${failure}`);
        if (!/^https?:$/.test(url.protocol) && url.protocol !== 'about:')
          throw new WebError(403, `${address} is not a web page: only http and https are recorded`);
      }
      checked = documents.length;
    };

    return {
      ...{ tab, stepper, check, warn, close },
      async load(url, between = async () => {}) {
        const answer = await tab.navigate(url).catch((err) => {
          if (!err.timedOut) throw err;
          throw new WebError(504, `${url} did not answer within 60 s`);
        });
        stepper.arrived();
        check(url);
        if (answer.isDownload) throw new WebError(422, `${url} is a download, not a page`);
        if (answer.errorText)
          throw new WebError(502, `${url} could not be loaded (${answer.errorText})`);
        for (let i = 0; i < Math.round(SETTLE_SECONDS * fps); i++) {
          await stepper.frame();
          await between();
        }
        check();
      },
      warnings() {
        const documents = new Set(tab.network.documents.map((address) => new URL(address).host));
        const refused = gate.refusals
          .filter(({ host, port }) => !documents.has(`${host}:${port}`) && !documents.has(host))
          .map(({ host, port, reason }) => `${host}:${port} was not loaded: ${reason}`);
        return [...new Set([...said, ...tab.notes, ...refused])];
      },
    };
  } catch (err) {
    await close();
    throw err;
  }
}
