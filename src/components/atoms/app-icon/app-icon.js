/**
 * Icon atom — renders Lucide SVG icons by name.
 * Icons loaded from /icons.json (generated at install from lucide-static).
 * @module components/atoms/app-icon
 */

import { html, define } from 'hybrids';

/** @type {Record<string, string>|null} */
let iconCache = null;

/** @type {Promise<Record<string, string>>} */
const loading = fetch('/icons.json')
  .then((r) => {
    if (r.ok) return r;
    throw new Error('icons.json not found');
  })
  .then((r) => r.json())
  .then((data) => {
    iconCache = data;
    return data;
  })
  .catch(() => {
    iconCache = {};
    return {};
  });

/**
 * @typedef {Object} AppIconHost
 * @property {string} name
 * @property {'sm'|'md'|'lg'} size
 * @property {boolean} ready - True once icons.json has loaded
 */

const SVG_ATTRS =
  'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';

/**
 * Markup for one icon; empty when the name is unknown or icons are not loaded.
 * @param {string} name
 * @returns {string}
 */
function svgFor(name) {
  const inner = iconCache?.[name];
  return inner ? `<svg ${SVG_ATTRS}>${inner}</svg>` : '';
}

/** @type {import('hybrids').Component<AppIconHost>} */
export default define({
  tag: 'app-icon',
  name: '',
  size: 'md',
  ready: {
    value: false,
    connect(host) {
      let connected = true;
      loading.then(() => {
        if (connected) host.ready = true;
      });
      return () => {
        connected = false;
      };
    },
  },
  render: {
    // `ready` is read so the icon re-renders when icons.json arrives; `name`
    // so it follows a changed name (play ↔ pause).
    value: ({ name, size, ready }) =>
      html`<span class="icon icon-${size}" innerHTML="${ready ? svgFor(name) : ''}"></span>`,
    shadow: false,
  },
});
