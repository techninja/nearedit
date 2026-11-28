/**
 * State badges on timeline clips — "CC" on a captioned clip, a mark on a
 * clip whose person cutout is being made. A feature registers a function
 * that looks at a clip and says what, if anything, to show; the timeline
 * draws whatever comes back and draws again when a feature says its state
 * changed. Features and the timeline thus know nothing of each other.
 * @module utils/timeline/badges
 */

/**
 * @typedef {Object} ClipBadge
 * @property {string} id - Which feature it belongs to (`captions`, `cutout`)
 * @property {string} text - A few characters at most
 * @property {'on'|'busy'|'warn'} tone - Working as asked, being made, or needs attention
 * @property {string} [title] - What it means, in a sentence
 */

/** @typedef {(clip: any, track: any) => ClipBadge|null|undefined} BadgeProvider */

/** @type {Set<BadgeProvider>} */
const providers = new Set();
/** @type {Set<() => void>} */
const listeners = new Set();

/**
 * Add a feature's badge.
 * @param {BadgeProvider} provider - Called for every clip drawn: keep it cheap
 * @returns {() => void} Remove it again
 */
export function registerClipBadge(provider) {
  providers.add(provider);
  badgesChanged();
  return () => {
    providers.delete(provider);
    badgesChanged();
  };
}

/**
 * The badges of a clip, in the order their features registered.
 * @param {any} clip
 * @param {any} [track]
 * @returns {ClipBadge[]} A provider that throws shows nothing
 */
export function clipBadges(clip, track) {
  /** @type {ClipBadge[]} */
  const badges = [];
  for (const provider of providers) {
    try {
      const badge = provider(clip, track);
      if (badge && badge.text) badges.push(badge);
    } catch (err) {
      console.warn('A clip badge failed', err);
    }
  }
  return badges;
}

/** A feature's state changed outside the document: the timeline should draw again. */
export function badgesChanged() {
  for (const listener of listeners) listener();
}

/**
 * Hear about changes that are not edits of the document.
 * @param {() => void} listener
 * @returns {() => void} Stop listening
 */
export function onBadgesChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
