/**
 * Licences as data: what each one asks of a video that uses a picture, its
 * plain name and where its terms are. An id is `cc-by-4.0`, `cc-by-sa-3.0-de`
 * (a Creative Commons licence, its version, a country's port), `cc0-1.0`,
 * `pdm-1.0` (the Public Domain Mark), `public-domain`, or the name of a
 * provider's own terms: `unsplash`, `pexels`, `nasa`. Anything else is not
 * known and is treated as asking for everything.
 * Isomorphic and pure. Contract: docs/app-spec/STOCK.md § Licences.
 * @module utils/stock/licenses
 */

/**
 * @typedef {Object} LicenseFacts
 * @property {string} id
 * @property {boolean} known - False for an id NearEdit cannot read
 * @property {string} name - `CC BY 4.0`, `Public domain`, `Unsplash License`
 * @property {string} url - The deed or the terms; '' when there is none
 * @property {boolean} attribution - A credit is asked for
 * @property {boolean} shareAlike - What is made with it carries the same licence
 * @property {boolean} nonCommercial - Not for a video that earns money
 * @property {boolean} noDerivatives - May not be cropped, moved over or changed
 * @property {string} note - What else to know, in a sentence; '' when nothing
 */

const CC = /^cc-(by(?:-nc)?(?:-sa|-nd)?)-(1\.0|2\.0|2\.1|2\.5|3\.0|4\.0)(?:-([a-z]{2,6}))?$/;
const CC_HOME = 'https://creativecommons.org';
const NOTHING = { attribution: false, shareAlike: false, nonCommercial: false, noDerivatives: false };
const EVERYTHING = { attribution: true, shareAlike: true, nonCommercial: true, noDerivatives: true };

/** @type {Record<string, Partial<LicenseFacts>>} */
const NAMED = {
  'cc0-1.0': { name: 'CC0 1.0', url: `${CC_HOME}/publicdomain/zero/1.0/` },
  'pdm-1.0': { name: 'Public Domain Mark 1.0', url: `${CC_HOME}/publicdomain/mark/1.0/` },
  'public-domain': { name: 'Public domain' },
  nasa: {
    ...{ name: 'NASA media guidelines', attribution: true },
    url: 'https://www.nasa.gov/nasa-brand-center/images-and-media/',
    note: 'Generally not under copyright. NASA is named as the source, and nothing may suggest that NASA endorses a product or a service.',
  },
  unsplash: {
    ...{ name: 'Unsplash License', url: 'https://unsplash.com/license', attribution: true },
    note: 'Free to use, also for money. The licence does not demand a credit; the terms of the Unsplash API, through which the picture was found, do.',
  },
  pexels: {
    ...{ name: 'Pexels License', url: 'https://www.pexels.com/license/', attribution: true },
    note: 'Free to use, also for money. Pexels asks that the photographer is credited wherever that is possible.',
  },
};

/**
 * The id of a Creative Commons licence.
 * @param {string} kind - `by`, `by-sa`, `by-nc`, `by-nd`, `by-nc-sa`, `by-nc-nd`
 * @param {string} [version] - `4.0` when the source names none
 * @param {string} [port] - A country's version: `de`, `uk`
 * @returns {string} `cc-by-sa-4.0`; lower case
 */
export function ccLicenseId(kind, version, port) {
  const number = /^\d\.\d$/.test(String(version || '')) ? version : '4.0';
  const place = /^[a-z]{2,6}$/i.test(String(port || '')) ? `-${port}` : '';
  return `cc-${kind}-${number}${place}`.toLowerCase();
}

/**
 * The licence a Creative Commons address stands for.
 * @param {unknown} url - `https://creativecommons.org/licenses/by-sa/3.0/de/`
 * @returns {string} Its id; '' for any other address
 */
export function licenseFromUrl(url) {
  const text = typeof url === 'string' ? url.toLowerCase() : '';
  const found = /creativecommons\.org\/(licenses|publicdomain)\/([a-z-]+)\/(\d\.\d)(?:\/([a-z]{2,6}))?/.exec(
    text,
  );
  if (!found) return '';
  if (found[1] === 'publicdomain') return { zero: 'cc0-1.0', mark: 'pdm-1.0' }[found[2]] || '';
  const id = ccLicenseId(found[2], found[3], found[4]);
  return CC.test(id) ? id : '';
}

/**
 * What a licence asks for.
 * @param {unknown} id
 * @returns {LicenseFacts} For an id that is not known: everything
 */
export function licenseFacts(id) {
  const key = typeof id === 'string' ? id.trim().toLowerCase() : '';
  const cc = CC.exec(key);
  if (cc) {
    const [, kind, version, port] = cc;
    const tail = port ? `${port}/` : '';
    return {
      ...{ id: key, known: true, note: '' },
      name: `CC ${kind.toUpperCase()} ${version}${port ? ` ${port.toUpperCase()}` : ''}`,
      url: `${CC_HOME}/licenses/${kind}/${version}/${tail}`,
      ...{ attribution: true, shareAlike: kind.endsWith('-sa') },
      ...{ nonCommercial: kind.includes('-nc'), noDerivatives: kind.endsWith('-nd') },
    };
  }
  if (Object.hasOwn(NAMED, key)) {
    return /** @type {LicenseFacts} */ ({
      ...{ id: key, known: true, url: '', note: '', ...NOTHING },
      ...NAMED[key],
    });
  }
  const note = 'NearEdit does not know this licence: read its terms before using the picture.';
  return { id: key, known: false, name: key || 'Unknown licence', url: '', note, ...EVERYTHING };
}

/**
 * What a search may be widened by. By default it offers only what may be
 * used in a video that is edited and may earn money.
 * @typedef {Object} Offer
 * @property {boolean} [shareAlike] - Also CC BY-SA: the video then carries that licence
 * @property {boolean} [nonCommercial] - Also non-commercial licences
 */

/**
 * Read `licenses=` of a search: `sa`, `nc`, both, or nothing.
 * @param {unknown} text - `sa,nc`; `share-alike` and `non-commercial` are read too
 * @returns {Required<Offer>}
 */
export function readOffer(text) {
  const words = String(typeof text === 'string' ? text : '')
    .toLowerCase()
    .split(/[\s,]+/);
  const has = (/** @type {string[]} */ ...names) => names.some((name) => words.includes(name));
  return { shareAlike: has('sa', 'share-alike'), nonCommercial: has('nc', 'non-commercial') };
}

/**
 * Whether a picture under this licence may be shown in a search. A licence
 * that forbids changes never is — cropping and moving over a picture
 * changes it — and neither is one NearEdit cannot read.
 * @param {unknown} id
 * @param {Offer} [offer]
 * @returns {boolean}
 */
export function mayOffer(id, offer = {}) {
  const facts = licenseFacts(id);
  if (!facts.known || facts.noDerivatives) return false;
  if (facts.shareAlike && !offer.shareAlike) return false;
  return !facts.nonCommercial || offer.nonCommercial === true;
}

/**
 * The Creative Commons licences a search offers, as a provider's filter
 * wants them.
 * @param {Offer} [offer]
 * @returns {string[]} `['by']`, with `by-sa`, `by-nc`, `by-nc-sa` when switched in
 */
export function ccKindsOffered(offer = {}) {
  return ['by', 'by-sa', 'by-nc', 'by-nc-sa'].filter((kind) => mayOffer(`cc-${kind}-4.0`, offer));
}
