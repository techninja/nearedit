/**
 * The exceptions list, `WEB_CAPTURE_ALLOW`: hosts the recording browser may
 * reach although they are private — a dev server, a staging site.
 *
 *   localhost:5173          that host, that port
 *   intranet.example        that host, any port
 *   *.staging.example.com   any host ending so (`*` stands for anything)
 *   192.168.1.*:8080        works for addresses too
 *   [::1]:3000              IPv6 in brackets
 *
 * A pattern is compared with the host as the page's address names it — not
 * with what the name resolves to. Pure.
 * @module api/web/allow
 */

/**
 * @typedef {Object} AllowPattern
 * @property {string} text - As written
 * @property {RegExp} host
 * @property {number|null} port - null = any port
 */

/** @param {string} host @returns {string} Lower case, no brackets, no trailing dot */
export function cleanHost(host) {
  return String(host)
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, '')
    .replace(/\.$/, '');
}

/**
 * Read one pattern.
 * @param {string} text
 * @returns {AllowPattern|null} null for something that is not a pattern
 */
export function parseAllowPattern(text) {
  const whole = text
    .trim()
    .replace(/^[a-z]+:\/\//i, '')
    .replace(/\/.*$/, '');
  const bracketed = /^\[([^\]]+)\](?::(\d+|\*))?$/.exec(whole);
  // More than one colon and no brackets: a bare IPv6 address, which has no port.
  const plain = /^([^:]+)(?::(\d+|\*))?$/.exec(whole);
  const match = bracketed || plain || (whole.includes(':') ? [whole, whole, undefined] : null);
  if (!match || !match[1]) return null;
  const port = match[2] && match[2] !== '*' ? Number(match[2]) : null;
  if (port !== null && !(port >= 1 && port <= 65535)) return null;
  const name = cleanHost(match[1]);
  // In an address `*` stands for digits only: "192.168.1.*" must not match "192.168.1.evil.com".
  const any = /^[\d.*]+$/.test(name) ? '\\d+' : '.*';
  const escaped = name
    .split('*')
    .map((piece) => piece.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join(any);
  return { text: text.trim(), host: new RegExp(`^${escaped}$`), port };
}

/**
 * Read the list.
 * @param {string|string[]|undefined} raw - Comma- or space-separated, or already a list
 * @returns {AllowPattern[]} Unreadable entries are left out
 */
export function parseAllowList(raw) {
  const entries = Array.isArray(raw) ? raw : String(raw || '').split(/[\s,]+/);
  return entries
    .filter((entry) => typeof entry === 'string' && entry.trim())
    .map(parseAllowPattern)
    .filter((pattern) => pattern !== null);
}

/**
 * @param {AllowPattern[]} patterns
 * @param {string} host
 * @param {number} port
 * @returns {boolean} True when a pattern names this host and port
 */
export function isAllowed(patterns, host, port) {
  const name = cleanHost(host);
  return patterns.some(
    (pattern) => pattern.host.test(name) && (pattern.port === null || pattern.port === port),
  );
}

/**
 * The pattern that would allow an address, for error messages.
 * @param {string} host
 * @param {number} port
 * @param {string} [protocol] - `http:` or `https:`; its default port is left out
 * @returns {string}
 */
export function allowHint(host, port, protocol = '') {
  const standard = { 'http:': 80, 'https:': 443 }[protocol];
  const name = host.includes(':') ? `[${cleanHost(host)}]` : cleanHost(host);
  return port && port !== standard ? `${name}:${port}` : name;
}
