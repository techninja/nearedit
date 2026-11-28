/**
 * One page under the recorder's control: attached, sized, with the helper
 * script planted in every document, dialogs dismissed, downloads and
 * service workers off. `call` reaches the helpers (in their own world),
 * `run` the page's own scripts.
 * @module api/web/tab
 */

import { WebError } from './errors.js';
import { NO_SERVICE_WORKERS, PAGE_SCRIPT, WORLD, helperCall } from './inject.js';
import { watchNetwork } from './network.js';

/**
 * @typedef {Object} Tab
 * @property {import('./cdp.js').Session} session
 * @property {import('./network.js').NetworkWatch} network
 * @property {(name: string, ...args: any[]) => Promise<any>} call - Call a helper of `page/`
 * @property {(js: string) => Promise<string>} run - Run a script in the page; resolves to '' or
 *   to what went wrong
 * @property {(url: string) => Promise<{ errorText?: string, isDownload?: boolean }>} navigate
 * @property {() => string} mainFrame - The id of the page's own frame
 * @property {string[]} notes - What happened that the person should know (dialogs dismissed)
 */

const CONTEXT_WAIT = 10_000;
/** The limit of WEBCLIP.md: 60 s to load a page. */
export const LOAD_TIMEOUT = 60_000;
const GONE = /Cannot find context|context was destroyed|Execution context|Cannot find default/i;

/**
 * Take over the browser's first page.
 * @param {import('./cdp.js').Connection} connection
 * @param {{ width: number, height: number, scale: number, colorScheme: string }} view
 * @returns {Promise<Tab>}
 */
export async function openTab(connection, { width, height, scale, colorScheme }) {
  const { targetInfos } = await connection.send('Target.getTargets');
  const page = targetInfos.find((/** @type {any} */ target) => target.type === 'page');
  if (!page) throw new WebError(503, 'The browser opened without a page');
  const { sessionId } = await connection.send('Target.attachToTarget', {
    ...{ targetId: page.targetId, flatten: true },
  });
  const session = connection.session(sessionId);
  /** @type {string[]} */
  const notes = [];
  let mainFrame = '';
  let context = 0;
  /** @type {(() => void)[]} */
  const contextWaiters = [];

  session.on('Runtime.executionContextCreated', ({ context: made }) => {
    if (made.name !== WORLD || made.auxData?.frameId !== mainFrame) return;
    context = made.id;
    for (const wake of contextWaiters.splice(0)) wake();
  });
  session.on('Runtime.executionContextDestroyed', ({ executionContextId }) => {
    if (executionContextId === context) context = 0;
  });
  session.on('Runtime.executionContextsCleared', () => void (context = 0));
  session.on('Page.frameNavigated', ({ frame }) => {
    if (frame.parentId) return;
    mainFrame = frame.id;
  });
  session.on('Page.javascriptDialogOpening', ({ type, message }) => {
    notes.push(
      `The page opened a dialog (${type}: ${JSON.stringify(message.slice(0, 80))}); it was dismissed`,
    );
    // Leaving a page must not be held up by its "are you sure?".
    const answer = { accept: type === 'beforeunload' };
    session.send('Page.handleJavaScriptDialog', answer).catch(() => {});
  });

  await session.send('Page.enable');
  mainFrame = (await session.send('Page.getFrameTree')).frameTree.frame.id;
  const network = watchNetwork(session, () => mainFrame);
  await Promise.all([
    session.send('Runtime.enable'),
    session.send('Network.enable'),
    session.send('Network.setBypassServiceWorker', { bypass: true }),
    connection.send('Browser.setDownloadBehavior', { behavior: 'deny' }),
    session.send('Emulation.setFocusEmulationEnabled', { enabled: true }),
    session.send('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-color-scheme', value: colorScheme }],
    }),
    session.send('Emulation.setDeviceMetricsOverride', {
      ...{ width, height, deviceScaleFactor: scale, mobile: false },
    }),
    session.send('Page.addScriptToEvaluateOnNewDocument', { source: NO_SERVICE_WORKERS }),
    session.send('Page.addScriptToEvaluateOnNewDocument', {
      ...{ source: PAGE_SCRIPT, worldName: WORLD, runImmediately: true },
    }),
  ]);

  /** @returns {Promise<number>} The helpers' world in the current document */
  const helpers = async () => {
    if (context) return context;
    await new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new WebError(503, 'The page stopped responding')),
        CONTEXT_WAIT,
      );
      contextWaiters.push(() => resolve(clearTimeout(timer)));
    });
    return context;
  };
  /** @type {(expression: string, contextId?: number) => Promise<any>} */
  const evaluate = async (expression, contextId) => {
    // A helper answers with plain data; a script of the page may answer with anything.
    const where = contextId ? { contextId, returnByValue: true } : { userGesture: true };
    const answer = await session.send('Runtime.evaluate', { expression, ...where });
    if (!answer.exceptionDetails) return answer.result.value;
    const { exception, text } = answer.exceptionDetails;
    const said = String(exception?.description || exception?.value || text || 'error');
    throw Object.assign(new Error(said.split('\n')[0]), { inPage: true });
  };

  return {
    session,
    network,
    notes,
    mainFrame: () => mainFrame,
    async call(name, ...args) {
      for (let attempt = 0; ; attempt++) {
        const used = await helpers();
        try {
          return await evaluate(helperCall(name, ...args), used);
        } catch (err) {
          // The document changed under the call: ask the new one.
          if (!GONE.test(err.message) || attempt >= 3) throw err;
          if (context === used) context = 0;
        }
      }
    },
    run: (js) =>
      evaluate(js).then(
        () => '',
        (err) => (err.inPage ? err.message : Promise.reject(err)),
      ),
    navigate: (url) => session.send('Page.navigate', { url }, LOAD_TIMEOUT),
  };
}
