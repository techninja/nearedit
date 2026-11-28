/**
 * The gate: whether the recording browser may connect to a host. Every
 * connection the browser makes — pages, frames, scripts, images, fetches,
 * web sockets, workers — passes here (through `proxy.js`), after the name
 * has been resolved, and the connection is then made to exactly the
 * address that was checked. Private addresses are refused unless
 * `WEB_CAPTURE_ALLOW` names the host. Contract: WEBCLIP.md § What the
 * browser may load.
 * @module api/web/gate
 */

import { lookup as dnsLookup } from 'node:dns/promises';
import { allowHint, cleanHost, isAllowed, parseAllowList } from './allow.js';
import { classifyAddress, isLocalName } from './ranges.js';

/**
 * @typedef {Object} Verdict
 * @property {boolean} ok
 * @property {string[]} addresses - Where to connect, in order of preference
 * @property {string} reason - Why not: "10.0.0.5 is a private address (private network)"
 * @typedef {Object} Refusal
 * @property {string} host
 * @property {number} port
 * @property {string} reason
 * @typedef {Object} Gate
 * @property {(host: string, port: number) => Promise<Verdict>} admit
 * @property {Refusal[]} refusals - Every refused host and port, once each
 * @property {(host: string, port: number) => Refusal|undefined} refused
 * @property {(listener: (refusal: Refusal) => void) => void} onRefusal
 * @property {string[]} allow - The exceptions, as written
 */

const DNS_SECONDS = 60;

/**
 * Explain a refusal to the person who asked for the recording.
 * @param {string} url - The address that was asked for
 * @param {string} reason - A `Refusal.reason`
 * @param {string} [setting] - How exceptions are given: the server's variable, or the CLI's option
 * @returns {string}
 */
export function refusalMessage(url, reason, setting = 'WEB_CAPTURE_ALLOW') {
  let hint = '';
  try {
    const { hostname, port, protocol } = new URL(url);
    const standard = protocol === 'https:' ? 443 : 80;
    hint = allowHint(hostname, Number(port) || standard, protocol);
  } catch {
    hint = 'host:port'; // not an address we can read; the reason still says what happened
  }
  const how = setting.startsWith('--') ? `${setting} ${hint}` : `${setting}=${hint}`;
  return `${url} was refused: ${reason}. To record it anyway, allow it: ${how}`;
}

/**
 * @param {Object} [options]
 * @param {string|string[]} [options.allow] - `WEB_CAPTURE_ALLOW`
 * @param {(host: string, options: object) => Promise<{ address: string }[]>} [options.lookup] -
 *   Name resolution; tests pass their own
 * @returns {Gate}
 */
export function createGate({ allow, lookup = /** @type {any} */ (dnsLookup) } = {}) {
  const patterns = parseAllowList(allow);
  /** @type {Refusal[]} */
  const refusals = [];
  /** @type {((refusal: Refusal) => void)[]} */
  const listeners = [];
  /** @type {Map<string, { at: number, addresses: Promise<string[]> }>} */
  const resolved = new Map();

  /** @type {(name: string) => Promise<string[]>} */
  const resolve = (name) => {
    const known = resolved.get(name);
    if (known && Date.now() - known.at < DNS_SECONDS * 1000) return known.addresses;
    const addresses = lookup(name, { all: true, verbatim: true }).then(
      (found) => found.map((entry) => entry.address),
      () => [], // a name that does not resolve leads nowhere
    );
    resolved.set(name, { at: Date.now(), addresses });
    return addresses;
  };

  /** @type {(host: string, port: number, reason: string) => Verdict} */
  const refuse = (host, port, reason) => {
    if (!refusals.some((r) => r.host === host && r.port === port)) {
      const refusal = { host, port, reason };
      refusals.push(refusal);
      for (const listener of listeners) listener(refusal);
    }
    return { ok: false, addresses: [], reason };
  };

  /** @type {Gate['admit']} */
  const admit = async (rawHost, port) => {
    const host = cleanHost(rawHost);
    const literal = classifyAddress(host);
    const addresses = literal.ip ? [host] : await resolve(host);
    if (isAllowed(patterns, host, port)) {
      // A local name may be missing from DNS; it still means this machine.
      const local = isLocalName(host) && !addresses.length ? ['127.0.0.1', '::1'] : addresses;
      return local.length
        ? { ok: true, addresses: local, reason: '' }
        : refuse(host, port, `${host} cannot be found (no such host name)`);
    }
    if (isLocalName(host)) return refuse(host, port, `${host} is this machine (loopback)`);
    if (!addresses.length) return refuse(host, port, `${host} cannot be found (no such host name)`);
    for (const address of addresses) {
      const { kind } = classifyAddress(address);
      if (!kind) continue;
      const what = literal.ip ? host : `${host} is at ${address}, which`;
      return refuse(host, port, `${what} is a private address (${kind})`);
    }
    return { ok: true, addresses, reason: '' };
  };

  return {
    admit,
    refusals,
    refused: (host, port) => refusals.find((r) => r.host === cleanHost(host) && r.port === port),
    onRefusal: (listener) => void listeners.push(listener),
    allow: patterns.map((pattern) => pattern.text),
  };
}
