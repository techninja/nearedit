/**
 * Which addresses are private: the range maths behind "the browser may not
 * reach the machine's own network". Pure — no DNS, no sockets.
 *
 * An address is read the way a browser reads one, so the usual disguises
 * are seen through: a bare number (`2130706433`), hex and octal parts
 * (`0x7f.1`, `0177.0.0.1`), short forms (`127.1`), IPv4 inside IPv6
 * (`::ffff:127.0.0.1`, `64:ff9b::7f00:1`, `2002:7f00:1::`).
 * @module api/web/ranges
 */

/** @param {string} text - Four decimal parts @returns {number} */
const quad = (text) => text.split('.').reduce((sum, part) => sum * 256 + Number(part), 0);

/** IPv4 blocks that are not the public internet, and what each is. */
const V4_BLOCKS = Object.entries({
  '0.0.0.0/8': 'this network',
  '10.0.0.0/8': 'private network',
  '100.64.0.0/10': 'carrier-grade NAT',
  '127.0.0.0/8': 'loopback',
  '169.254.0.0/16': 'link-local',
  '172.16.0.0/12': 'private network',
  '192.0.0.0/24': 'protocol assignments',
  '192.0.2.0/24': 'documentation',
  '192.88.99.0/24': '6to4 relay',
  '192.168.0.0/16': 'private network',
  '198.18.0.0/15': 'benchmarking',
  '198.51.100.0/24': 'documentation',
  '203.0.113.0/24': 'documentation',
  '224.0.0.0/4': 'multicast',
  '240.0.0.0/4': 'reserved',
}).map(([block, kind]) => {
  const [first, bits] = block.split('/');
  return { first: quad(first), size: 2 ** (32 - Number(bits)), kind };
});

/** IPv6 blocks that are not the public internet: first 16 bits, their mask, what it is. */
const V6_BLOCKS = [
  { first: 0xfc00, mask: 0xfe00, kind: 'unique local' },
  { first: 0xfe80, mask: 0xffc0, kind: 'link-local' },
  { first: 0xfec0, mask: 0xffc0, kind: 'site-local' },
  { first: 0xff00, mask: 0xff00, kind: 'multicast' },
];

/**
 * Read an IPv4 address as `inet_aton` and browsers do: one to four parts,
 * each decimal, octal (leading 0) or hex (0x); the last part fills the
 * remaining bytes.
 * @param {string} text
 * @returns {number|null} The address as a 32-bit number; null when it is not one
 */
export function parseIPv4(text) {
  const parts = text.replace(/\.$/, '').split('.');
  if (parts.length < 1 || parts.length > 4) return null;
  const numbers = parts.map((part) => {
    if (/^0x[0-9a-f]*$/i.test(part)) return part.length > 2 ? parseInt(part.slice(2), 16) : 0;
    if (/^0[0-7]*$/.test(part)) return parseInt(part, 8);
    return /^[1-9]\d*$/.test(part) ? Number(part) : NaN;
  });
  if (numbers.some((n) => !Number.isFinite(n))) return null;
  const last = numbers.pop();
  if (numbers.some((n) => n > 255) || last >= 256 ** (4 - numbers.length)) return null;
  return numbers.reduce((sum, n, i) => sum + n * 256 ** (3 - i), last);
}

/**
 * Read an IPv6 address: brackets, a zone (`%eth0`), `::`, and an IPv4 tail
 * are all understood.
 * @param {string} text
 * @returns {number[]|null} Eight 16-bit groups; null when it is not one
 */
export function parseIPv6(text) {
  let body = text.replace(/^\[|\]$/g, '').replace(/%.*$/, '');
  const tail = /^(.*:)(\d+\.\d+\.\d+\.\d+)$/.exec(body);
  if (tail) {
    const v4 = /^\d{1,3}(\.\d{1,3}){3}$/.test(tail[2]) ? parseIPv4(tail[2]) : null;
    if (v4 === null) return null;
    body = `${tail[1]}${(v4 >>> 16).toString(16)}:${(v4 & 0xffff).toString(16)}`;
  }
  const halves = body.split('::');
  if (halves.length > 2 || !body.includes(':')) return null;
  const groups = (/** @type {string} */ half) => (half ? half.split(':') : []);
  const [head, rest] = [groups(halves[0]), groups(halves[1] || '')];
  const missing = 8 - head.length - rest.length;
  if (halves.length === 1 ? missing !== 0 : missing < 1) return null;
  const all = [...head, ...Array(halves.length === 2 ? missing : 0).fill('0'), ...rest];
  if (all.some((group) => !/^[0-9a-f]{1,4}$/i.test(group))) return null;
  return all.map((group) => parseInt(group, 16));
}

/**
 * @param {number} address - A 32-bit IPv4 address
 * @returns {string} What private block it is in; '' for a public address
 */
function v4Kind(address) {
  return (
    V4_BLOCKS.find(({ first, size }) => address >= first && address < first + size)?.kind || ''
  );
}

/**
 * @param {number[]} g - Eight groups
 * @returns {string} What private block it is in; '' for a public address
 */
function v6Kind(g) {
  const zeros = (/** @type {number} */ count) => g.slice(0, count).every((group) => group === 0);
  const embedded = (/** @type {number} */ hi, /** @type {number} */ lo) =>
    v4Kind(hi * 65536 + lo) && `${v4Kind(hi * 65536 + lo)}, inside IPv6`;
  if (zeros(7) && g[7] === 0) return 'unspecified';
  if (zeros(7) && g[7] === 1) return 'loopback';
  // ::ffff:a.b.c.d (mapped), ::a.b.c.d (compatible), ::ffff:0:a.b.c.d (translated)
  if (zeros(5) && (g[5] === 0xffff || g[5] === 0)) return embedded(g[6], g[7]) || '';
  if (zeros(4) && g[4] === 0xffff && g[5] === 0) return embedded(g[6], g[7]) || '';
  // NAT64 (64:ff9b::/96): on an IPv6-only network every IPv4 site has such an address.
  if (g[0] === 0x64 && g[1] === 0xff9b) return embedded(g[6], g[7]) || '';
  if (g[0] === 0x2002) return embedded(g[1], g[2]) || ''; // 6to4 carries an IPv4 address
  if (g[0] === 0x2001 && g[1] === 0) return 'Teredo';
  if (g[0] === 0x2001 && g[1] === 0xdb8) return 'documentation';
  if (g[0] === 0x100 && g[1] === 0 && g[2] === 0 && g[3] === 0) return 'discard';
  return V6_BLOCKS.find(({ first, mask }) => (g[0] & mask) === first)?.kind || '';
}

/**
 * Classify an address.
 * @param {string} address - IPv4 or IPv6 text, in any form a browser accepts
 * @returns {{ ip: boolean, kind: string }} `ip` false when the text is not
 *   an address at all (a host name); `kind` '' for a public address,
 *   otherwise why it is not one: `loopback`, `private network`, `link-local`…
 */
export function classifyAddress(address) {
  const text = String(address).trim();
  const v6 = text.includes(':') ? parseIPv6(text) : null;
  if (v6) return { ip: true, kind: v6Kind(v6) };
  const v4 = text.includes(':') ? null : parseIPv4(text);
  if (v4 !== null) return { ip: true, kind: v4Kind(v4) };
  return { ip: false, kind: '' };
}

/**
 * @param {string} host - A host name
 * @returns {boolean} True for names that mean this machine without any lookup
 */
export function isLocalName(host) {
  const name = host.toLowerCase().replace(/\.$/, '');
  return name === 'localhost' || name.endsWith('.localhost');
}
