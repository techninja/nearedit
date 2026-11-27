/**
 * Temporary harness for the Vegas-parity work: the timeline panel alone on
 * a page, with the keyboard on, opened on an adaptation named in the URL
 * (`?project=…&adaptation=…&theme=dark`). Deleted before the work is done.
 * @module dev/vegas/harness
 */

import { openAdaptation } from '#utils/editor/project.js';
import { initKeyboard } from '#utils/keyboard/index.js';
import { loadLibrary } from '#utils/media/library.js';
import '#organisms/timeline-panel/index.js';

const params = new URLSearchParams(location.search);
initKeyboard();
const project = params.get('project');
if (project) {
  await openAdaptation(project, params.get('adaptation'));
  await loadLibrary(project);
}
/** @type {any} */ (window).harnessReady = true;
