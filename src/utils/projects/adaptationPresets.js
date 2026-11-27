/**
 * The frame presets, frame rates and statuses an adaptation can have.
 * The server's own list: src/api/projects/adaptationFields.js. Pure data.
 * @module utils/projects/adaptationPresets
 */

/**
 * Aspect-ratio presets; the first size of each is the server's default.
 * @type {{ aspectRatio: string, label: string, hint: string, sizes: string[] }[]}
 */
export const ASPECT_PRESETS = [
  {
    aspectRatio: '16:9',
    label: 'Landscape',
    hint: 'YouTube, TV, desktop',
    sizes: ['1920x1080', '3840x2160', '1280x720'],
  },
  {
    aspectRatio: '9:16',
    label: 'Vertical',
    hint: 'Reels, Shorts, TikTok',
    sizes: ['1080x1920', '2160x3840', '720x1280'],
  },
  {
    aspectRatio: '1:1',
    label: 'Square',
    hint: 'Feed posts, audiograms',
    sizes: ['1080x1080', '2160x2160', '720x720'],
  },
  { aspectRatio: '4:5', label: 'Portrait', hint: 'Instagram feed', sizes: ['1080x1350'] },
  {
    aspectRatio: '4:3',
    label: 'Classic',
    hint: 'Older screens, slides',
    sizes: ['1440x1080', '960x720'],
  },
  { aspectRatio: '21:9', label: 'Ultrawide', hint: 'Cinematic', sizes: ['2560x1080', '3440x1440'] },
];

export const FPS_CHOICES = [24, 25, 30, 50, 60];

/** @type {{ value: string, label: string }[]} */
export const ADAPTATION_STATUSES = [
  { value: 'draft', label: 'Draft' },
  { value: 'review', label: 'In review' },
  { value: 'final', label: 'Final' },
  { value: 'rendered', label: 'Rendered' },
];

/**
 * @param {string} aspectRatio
 * @returns {typeof ASPECT_PRESETS[number]|undefined}
 */
export const presetFor = (aspectRatio) => ASPECT_PRESETS.find((p) => p.aspectRatio === aspectRatio);

/**
 * @param {string} status
 * @returns {string} Display label
 */
export const statusLabel = (status) =>
  ADAPTATION_STATUSES.find((s) => s.value === status)?.label || status || 'Draft';
