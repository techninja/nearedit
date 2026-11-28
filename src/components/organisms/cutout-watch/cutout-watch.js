/**
 * Cutout watch organism — the part of "Cut out person" that is there
 * whether or not the inspector is open. While it is on the page (the editor
 * mounts one) the cutouts of the open document are kept made: missing ones
 * are asked for, jobs are followed and their results attached
 * (`#utils/cutoutUi/runtime.js`), and timeline clips carry the cutout's
 * badge. It draws nothing; it tells screen readers when a cutout starts or
 * fails.
 * @module components/organisms/cutout-watch
 */

import { define, html } from 'hybrids';
import { registerCutoutBadge } from '#utils/cutoutUi/badge.js';
import { startCutouts } from '#utils/cutoutUi/runtime.js';
import { cutoutJobs, describeJobs } from '#utils/cutoutUi/state.js';

/**
 * @typedef {Object} CutoutWatchHost
 * @property {import('#utils/cutoutUi/state.js').CutoutJobs} jobs
 */

/**
 * Run the cutouts for as long as the element is on the page.
 * @param {HTMLElement} _host
 * @param {string} _key
 * @param {() => void} invalidate
 * @returns {() => void}
 */
function run(_host, _key, invalidate) {
  const stops = [startCutouts(), registerCutoutBadge(), cutoutJobs.subscribe(() => invalidate())];
  return () => {
    for (const stop of stops) stop();
  };
}

/** @type {import('hybrids').Component<CutoutWatchHost>} */
export default define({
  tag: 'cutout-watch',
  jobs: { value: () => cutoutJobs.get(), connect: run },
  render: {
    value: ({ jobs }) => html`<span class="sr-only" role="status">${describeJobs(jobs)}</span>`,
    shadow: false,
  },
});
