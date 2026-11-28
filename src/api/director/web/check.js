/**
 * What is checked about a site demo before anything is recorded: that
 * there is an address, that it is a web address, that the recorder may go
 * there, and that there is a browser to record with. Whatever can be known
 * without waiting is refused before a job exists (`checkSite`, called by
 * `request.js`); the rest fails the job at once, in the recorder's own
 * words. Reference: docs/app-spec/DIRECTOR-WEB.md § Refusals.
 * @module api/director/web/check
 */

import { pageUrl } from '#utils/web/coerce.js';
import { RECIPE_LIMITS } from '#utils/web/limits.js';
import { getConfig } from '../../lib/config.js';
import { cleanHost, isAllowed, parseAllowList } from '../../web/allow.js';
import { WebError } from '../../web/errors.js';
import { createGate, refusalMessage } from '../../web/gate.js';
import { classifyAddress, isLocalName } from '../../web/ranges.js';
import { browserStatus } from '../../web/status.js';
import { DirectorError } from '../errors.js';

const FIELD = 'params.url';

/**
 * @param {string} message
 * @param {string} about - What to tell beside the field
 * @param {string} [detail]
 * @returns {DirectorError} 422, naming the address field
 */
const refused = (message, about, detail = '') =>
  new DirectorError(message, { status: 422, detail, fields: { [FIELD]: about } });

/**
 * The address a directive asks for.
 * @param {import('#utils/director/directive.js').Directive} directive
 * @returns {string} An absolute `http(s)` address. A bare `example.com/page`
 *   is read as `https://example.com/page`
 * @throws {DirectorError} 422 with `fields['params.url']`
 */
export function siteUrl(directive) {
  const given = String(directive.params.url ?? '').trim();
  if (!given)
    throw refused(
      'Give the address of the page to demo',
      'The address is missing',
      'For example https://example.com.',
    );
  const bare =
    !/^[a-z][a-z0-9+.-]*:/i.test(given) && /^[^\s/]+\.[a-z]{2,}(?:[/?#:]\S*)?$/i.test(given);
  const url = pageUrl(bare ? `https://${given}` : given, RECIPE_LIMITS.url);
  if (!url)
    throw refused(
      `“${given.slice(0, 80)}” is not a web address`,
      'Must start with http:// or https://',
      'Only pages served over http or https can be recorded.',
    );
  return url;
}

/**
 * @param {string} url
 * @returns {{ host: string, port: number }}
 */
function hostAndPort(url) {
  const { hostname, port, protocol } = new URL(url);
  return { host: cleanHost(hostname), port: Number(port) || (protocol === 'https:' ? 443 : 80) };
}

/**
 * Refuse what can be refused without waiting for anything: no address, an
 * address that is not one, and an address that is private on its face — a
 * literal private or loopback address, or a `localhost` name — unless
 * `WEB_CAPTURE_ALLOW` names it.
 * @param {import('#utils/director/directive.js').Directive} directive
 * @returns {string} The address
 * @throws {DirectorError} 422
 */
export function checkSite(directive) {
  const url = siteUrl(directive);
  const { host, port } = hostAndPort(url);
  if (isAllowed(parseAllowList(getConfig().web.allow), host, port)) return url;
  const literal = classifyAddress(host);
  // The two reasons the recorder's gate gives for an address it need not look up.
  const local = isLocalName(host) ? `${host} is this machine (loopback)` : '';
  const reason = local || (literal.kind && `${host} is a private address (${literal.kind})`);
  if (reason) throw refused(refusalMessage(url, reason), reason);
  return url;
}

/**
 * A recorder failure as a director error, in the recorder's own words.
 * @param {any} err
 * @returns {any} A `DirectorError` for a `WebError`; anything else unchanged
 */
export function asDirectorError(err) {
  if (!(err instanceof WebError)) return err;
  return new DirectorError(err.message, { status: err.status, detail: err.detail });
}

/**
 * What can only be known by asking: whether the address — once its name is
 * looked up — is one the recorder may open, and whether there is a browser.
 * @param {string} url
 * @param {{ status?: typeof browserStatus }} [deps] - Tests inject the recorder's status
 * @returns {Promise<string>} The path of the browser to record with
 * @throws {DirectorError} 422, saying what the recorder says
 */
export async function checkRecorder(url, deps = {}) {
  const status = await (deps.status || browserStatus)();
  if (!status.available)
    throw new DirectorError(`A site demo needs a browser to record with. ${status.reason}`, {
      status: 422,
      detail:
        'Web clips are recorded with chrome-headless-shell (docs/app-spec/WEBCLIP.md § Server).',
    });
  const { host, port } = hostAndPort(url);
  const verdict = await createGate({ allow: getConfig().web.allow }).admit(host, port);
  if (!verdict.ok) throw refused(refusalMessage(url, verdict.reason), verdict.reason);
  return status.browser.path;
}
