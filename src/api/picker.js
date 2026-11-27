/**
 * Native OS folder picker — spawns a system dialog and returns the path.
 * macOS: osascript, Linux: zenity/kdialog, Windows: powershell.
 * @module api/picker
 */

import { Router } from 'express';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { platform } from 'node:os';

const exec = promisify(execFile);
export const pickerRouter = Router();

/**
 * Spawn a native folder picker dialog.
 * @returns {Promise<string|null>} Absolute path or null if cancelled
 */
async function nativeFolderPicker() {
  const os = platform();

  if (os === 'darwin') {
    try {
      const { stdout } = await exec(
        'osascript',
        ['-e', 'set theFolder to POSIX path of (choose folder with prompt "Select media folder")'],
        { timeout: 60_000 },
      );
      const path = stdout.trim().replace(/\/$/, '');
      return path || null;
    } catch {
      return null;
    }
  }

  if (os === 'linux') {
    // Try zenity first, then kdialog
    try {
      const { stdout } = await exec(
        'zenity',
        ['--file-selection', '--directory', '--title=Select media folder'],
        { timeout: 60_000 },
      );
      return stdout.trim() || null;
    } catch {
      try {
        const { stdout } = await exec(
          'kdialog',
          ['--getexistingdirectory', '.', '--title', 'Select media folder'],
          { timeout: 60_000 },
        );
        return stdout.trim() || null;
      } catch {
        return null;
      }
    }
  }

  if (os === 'win32') {
    try {
      const script = `Add-Type -AssemblyName System.Windows.Forms; $f = New-Object System.Windows.Forms.FolderBrowserDialog; $f.Description = 'Select media folder'; if($f.ShowDialog() -eq 'OK'){$f.SelectedPath}`;
      const { stdout } = await exec('powershell', ['-Command', script], { timeout: 60_000 });
      return stdout.trim() || null;
    } catch {
      return null;
    }
  }

  return null;
}

/** POST /api/pick-folder — open native folder picker, return path */
pickerRouter.post('/pick-folder', async (_req, res) => {
  const path = await nativeFolderPicker();
  if (path) {
    res.json({ path });
  } else {
    res.status(204).end();
  }
});
