/**
 * Reader for FFmpeg's `-progress` stream (key=value lines on stderr, mixed
 * with real error output). Pure.
 * @module api/render/progress
 */

const PROGRESS_KEY =
  /^(frame|fps|stream_\d+_\d+_q|bitrate|total_size|out_time|out_time_us|out_time_ms|dup_frames|drop_frames|speed|progress)=/;

/**
 * @param {number} duration - Seconds the finished output will have
 * @param {(percent: number) => void} onPercent - Called when the whole percent changes
 * @returns {{ line: (text: string) => void, errors: string[] }} `line` consumes
 *   one stderr line; `errors` collects the lines that were not progress
 */
export function createProgressReader(duration, onPercent) {
  const errors = [];
  let last = -1;
  const line = (text) => {
    if (!PROGRESS_KEY.test(text)) {
      errors.push(text.trim());
      if (errors.length > 20) errors.shift();
      return;
    }
    // out_time_us is microseconds; so is out_time_ms, despite its name.
    const match = /^out_time_(?:us|ms)=(-?\d+)/.exec(text);
    if (!match || !(duration > 0)) return;
    const percent = Math.max(
      0,
      Math.min(99, Math.floor((Number(match[1]) / 1e6 / duration) * 100)),
    );
    if (percent === last) return;
    last = percent;
    onPercent(percent);
  };
  return { line, errors };
}
