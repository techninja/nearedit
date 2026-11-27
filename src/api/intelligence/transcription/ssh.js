/**
 * SSH provider — the original NearEdit setup, generalised: run a command on
 * a remote (GPU) machine, which downloads the media back from this server
 * over HTTP and prints a transcript as JSON.
 *
 * ssh hands the remote command to the remote user's shell as one string, so
 * every value that did not come from the operator's own configuration (the
 * media URL, model, language) is single-quoted for a POSIX shell. Locally the
 * process is spawned with an argument array, never through a shell.
 * @module api/intelligence/transcription/ssh
 */

import { normalizeTranscript } from './normalize.js';
import { parseJsonLoose } from '../http.js';

const SAFE_HOST = /^[A-Za-z0-9_][A-Za-z0-9_.@:[\]-]*$/; // never starts with "-"
const SSH_OPTIONS = ['-o', 'BatchMode=yes', '-o', 'ServerAliveInterval=30'];

/**
 * Quote a value as one POSIX shell word.
 * @param {unknown} value
 * @returns {string}
 */
export function shellQuote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

/**
 * URL the remote machine uses to fetch a media file from this server.
 * @param {string} publicUrl - e.g. "http://192.168.1.20:6556"
 * @param {string} filePath
 * @returns {string}
 */
export function mediaUrl(publicUrl, filePath) {
  const encoded = encodeURIComponent(filePath).replace(
    /[!'()*~]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `${publicUrl.replace(/\/+$/, '')}/api/media/file?path=${encoded}`;
}

/**
 * Build the remote command line. `TRANSCRIBE_SSH_COMMAND` may contain the
 * placeholders `{url}`, `{model}` and `{language}`; without `{url}` the
 * arguments are appended as `<url> --model <model> [--language <code>]`.
 * @param {string} template - Operator-supplied command (trusted configuration)
 * @param {{ url: string, model: string, language?: string }} values
 * @returns {string}
 */
export function remoteCommand(template, values) {
  const { url, model, language = '' } = values;
  if (template.includes('{url}')) {
    // Function replacers: a plain string would have "$&"-style patterns expanded.
    return template
      .replaceAll('{url}', () => shellQuote(url))
      .replaceAll('{model}', () => shellQuote(model))
      .replaceAll('{language}', () => shellQuote(language));
  }
  const extra = language ? ` --language ${shellQuote(language)}` : '';
  return `${template} ${shellQuote(url)} --model ${shellQuote(model)}${extra}`;
}

/**
 * @param {import('../settings.js').Settings} settings
 * @param {import('../steps/types.js').Deps} deps
 * @returns {import('./index.js').TranscribeProvider}
 */
export function createSshTranscriber(settings, deps) {
  const cfg = settings.transcription;

  /** @returns {string} '' when the configuration is complete */
  function misconfigured() {
    if (!cfg.sshHost) return 'HYDRA_HOST is not set';
    if (!SAFE_HOST.test(cfg.sshHost)) return 'HYDRA_HOST is not a valid ssh host';
    if (!cfg.sshCommand) return 'TRANSCRIBE_SSH_COMMAND is not set';
    if (!cfg.publicUrl) return 'SERVER_HOST is not set (the remote host fetches media from it)';
    return '';
  }

  return {
    name: 'ssh',

    async available() {
      const problem = misconfigured();
      if (problem) return { available: false, detail: problem };
      try {
        const args = [...SSH_OPTIONS, '-o', 'ConnectTimeout=2', '--', cfg.sshHost, 'true'];
        await deps.run('ssh', args, { timeout: 4000 });
        return { available: true, detail: `ssh ${cfg.sshHost}` };
      } catch (err) {
        const missing = err.code === 'ENOENT';
        const reason = missing ? 'ssh client not found' : err.message.split('\n').pop();
        return { available: false, detail: `${cfg.sshHost}: ${reason}` };
      }
    },

    async transcribe(filePath, options = {}) {
      const problem = misconfigured();
      if (problem) throw new Error(problem);
      const command = remoteCommand(cfg.sshCommand, {
        url: mediaUrl(cfg.publicUrl, filePath),
        model: cfg.model,
        language: options.language,
      });
      const args = [...SSH_OPTIONS, '-o', 'ConnectTimeout=15', '--', cfg.sshHost, command];
      const { stdout } = await deps.run('ssh', args, { signal: options.signal });
      return normalizeTranscript(parseJsonLoose(stdout, (text) => text));
    },
  };
}
