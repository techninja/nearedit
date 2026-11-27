/**
 * ffmpeg / ffprobe process helpers shared by render, previews and analysis.
 * Always spawned with an argument array — never through a shell.
 * @module api/lib/ffmpeg
 */

import { spawn } from 'node:child_process';

/**
 * @typedef {Object} RunOptions
 * @property {AbortSignal} [signal] - Kills the process when aborted
 * @property {number} [timeout] - Milliseconds, 0 = none
 * @property {(line: string) => void} [onStderr] - Called per stderr line
 * @property {boolean} [binary] - Resolve stdout as a Buffer instead of a string
 * @property {number} [maxStderr] - Bytes of stderr tail to keep (default 16k)
 */

/**
 * Run a command to completion.
 * @param {string} cmd
 * @param {string[]} args
 * @param {RunOptions} [opts]
 * @returns {Promise<{ stdout: any, stderr: string }>} stdout is string, or Buffer when binary
 */
export function run(cmd, args, opts = {}) {
  const { signal, timeout = 0, onStderr, binary = false, maxStderr = 16384 } = opts;
  return new Promise((resolvePromise, reject) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    const out = [];
    let stderr = '';
    let pending = '';
    let timer = null;
    let killedBy = '';

    const kill = (reason) => {
      killedBy = reason;
      child.kill('SIGKILL');
    };
    const onAbort = () => kill('aborted');
    if (signal?.aborted) onAbort();
    signal?.addEventListener('abort', onAbort, { once: true });
    if (timeout > 0) timer = setTimeout(() => kill('timed out'), timeout);

    child.stdout.on('data', (chunk) => out.push(chunk));
    child.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      stderr = (stderr + text).slice(-maxStderr);
      if (!onStderr) return;
      const lines = (pending + text).split(/[\r\n]+/);
      pending = lines.pop() || '';
      for (const line of lines) if (line) onStderr(line);
    });
    const finish = (err) => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      if (err) return reject(err);
      const buf = Buffer.concat(out);
      resolvePromise({ stdout: binary ? buf : buf.toString(), stderr });
    };
    child.on('error', (err) => finish(err));
    child.on('close', (code) => {
      if (killedBy) return finish(Object.assign(new Error(`${cmd} ${killedBy}`), { killedBy }));
      if (code !== 0) {
        const tail = stderr.trim().split('\n').slice(-6).join('\n');
        return finish(Object.assign(new Error(`${cmd} exited ${code}: ${tail}`), { code, stderr }));
      }
      finish(null);
    });
  });
}

/**
 * Parse an ffprobe rational such as "30000/1001" without eval.
 * @param {string|undefined} value
 * @returns {number|null}
 */
export function parseFraction(value) {
  if (!value) return null;
  const [n, d] = String(value).split('/').map(Number);
  if (!Number.isFinite(n)) return null;
  if (d === undefined) return n;
  return d ? n / d : null;
}

/**
 * Parse an ffmpeg "HH:MM:SS.xx" timestamp into seconds.
 * @param {string} stamp
 * @returns {number}
 */
export function parseTimestamp(stamp) {
  const [h, m, s] = stamp.split(':').map(Number);
  return h * 3600 + m * 60 + s;
}

/**
 * Probe a media file and normalise the fields NearEdit cares about.
 * @param {string} filePath
 * @param {{ signal?: AbortSignal }} [opts]
 * @returns {Promise<{ duration: number|null, bitrate: number|null, hasVideo: boolean,
 *   hasAudio: boolean, width?: number, height?: number, fps?: number|null, codec?: string,
 *   pixFmt?: string, rotation?: number, audioCodec?: string, sampleRate?: number|null,
 *   channels?: number } | null>} null when the file cannot be probed
 */
export async function probe(filePath, opts = {}) {
  let data;
  try {
    const args = ['-v', 'quiet', '-print_format', 'json', '-show_format', '-show_streams'];
    const { stdout } = await run('ffprobe', [...args, filePath], { ...opts, timeout: 60_000 });
    data = JSON.parse(stdout);
  } catch {
    return null;
  }
  const format = data.format || {};
  const streams = data.streams || [];
  const video = streams.find((s) => s.codec_type === 'video' && !s.disposition?.attached_pic);
  const audio = streams.find((s) => s.codec_type === 'audio');
  const rotate = video?.side_data_list?.find((d) => d.rotation !== undefined)?.rotation;
  const duration = parseFloat(format.duration ?? video?.duration ?? audio?.duration);
  return {
    duration: Number.isFinite(duration) ? duration : null,
    bitrate: format.bit_rate ? parseInt(format.bit_rate, 10) : null,
    hasVideo: !!video,
    hasAudio: !!audio,
    ...(video && {
      width: video.width,
      height: video.height,
      fps: parseFraction(video.avg_frame_rate) || parseFraction(video.r_frame_rate),
      codec: video.codec_name,
      pixFmt: video.pix_fmt,
      rotation: Number(rotate ?? video.tags?.rotate ?? 0) || 0,
    }),
    ...(audio && {
      audioCodec: audio.codec_name,
      sampleRate: audio.sample_rate ? parseInt(audio.sample_rate, 10) : null,
      channels: audio.channels,
    }),
  };
}
