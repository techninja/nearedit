/**
 * Native OS folder picker — opens the desktop's own "choose folder" dialog
 * when the server runs on a machine somebody is sitting at. On a headless
 * server there is nothing to open, so the route answers 204 straight away
 * and the UI falls back to the in-app folder browser (browse.js).
 * macOS: osascript. Linux: zenity, then kdialog. Windows: PowerShell.
 * @module api/picker
 */

import { platform } from 'node:os';
import { Router } from 'express';
import { run } from './lib/ffmpeg.js';
import { errorHandler } from './lib/httpErrors.js';
import { isBrowsablePath } from './lib/paths.js';

export const pickerRouter = Router();

const TITLE = 'Select a folder';
/** How long a person may take to choose before the dialog is closed. */
const DIALOG_TIMEOUT_MS = 2 * 60 * 1000;
const WINDOWS_SCRIPT =
  'Add-Type -AssemblyName System.Windows.Forms; ' +
  '$f = New-Object System.Windows.Forms.FolderBrowserDialog; ' +
  `$f.Description = '${TITLE}'; if ($f.ShowDialog() -eq 'OK') { $f.SelectedPath }`;

/** Dialog commands per platform, tried in order until one produces a path. */
const DIALOGS = {
  darwin: [['osascript', '-e', `POSIX path of (choose folder with prompt "${TITLE}")`]],
  linux: [
    ['zenity', '--file-selection', '--directory', `--title=${TITLE}`],
    ['kdialog', '--getexistingdirectory', '.', '--title', TITLE],
  ],
  win32: [['powershell', '-NoProfile', '-Command', WINDOWS_SCRIPT]],
};

/**
 * Whether a dialog could appear on a screen at all.
 * @param {string} os - `os.platform()` value
 * @param {Record<string, string|undefined>} env
 * @returns {boolean}
 */
export function hasDesktop(os, env) {
  if (os === 'linux') return !!(env.DISPLAY || env.WAYLAND_DISPLAY);
  return os === 'darwin' || os === 'win32';
}

/** @type {Promise<string|null>|null} The dialog currently on screen, shared by concurrent requests */
let openDialog = null;

const LOOPBACK = ['127.0.0.1', '::1', '::ffff:127.0.0.1'];

/**
 * A dialog on the server's screen only helps somebody using a browser on that
 * same machine; a request from elsewhere on the network gets the in-app browser.
 * @param {import('express').Request} req
 * @returns {boolean}
 */
function isLocalRequest(req) {
  return LOOPBACK.includes(req.socket.remoteAddress || '');
}

/**
 * Show the native folder dialog.
 * @param {{ os?: string, env?: Record<string, string|undefined>,
 *   exec?: (cmd: string, args: string[], opts: object) => Promise<{ stdout: string }> }} [deps]
 *   Injectable for tests; defaults to the real platform, environment and process runner
 * @returns {Promise<string|null>} The chosen absolute path; null when there is no desktop, no
 *   dialog program, or the person cancelled
 */
export async function pickFolder(deps = {}) {
  const { os = platform(), env = process.env, exec = run } = deps;
  if (!hasDesktop(os, env)) return null;
  for (const [cmd, ...args] of DIALOGS[os] || []) {
    try {
      const { stdout } = await exec(cmd, args, { timeout: DIALOG_TIMEOUT_MS });
      const chosen = stdout.trim().replace(/(?<=.)\/$/, ''); // osascript appends a slash
      if (chosen) return chosen;
      return null; // dialog ran and was dismissed without a choice
    } catch (err) {
      // ENOENT: this dialog program is not installed, try the next one.
      // Anything else is the dialog closing without a choice (cancel, timeout).
      if (err.code !== 'ENOENT') return null;
    }
  }
  return null;
}

/**
 * POST /api/pick-folder — `200 { path, browsable }` with the chosen folder, or 204 when
 * there is no desktop, the request comes from another machine, or nothing was chosen.
 * `browsable` is false when the folder lies outside BROWSE_ROOTS and so cannot be used
 * for a project.
 */
pickerRouter.post('/pick-folder', async (req, res) => {
  if (!isLocalRequest(req)) return res.status(204).end();
  openDialog ||= pickFolder().finally(() => {
    openDialog = null;
  });
  const path = await openDialog;
  if (!path) return res.status(204).end();
  res.json({ path, browsable: isBrowsablePath(path) });
});

pickerRouter.use(errorHandler);
