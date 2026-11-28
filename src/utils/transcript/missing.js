/**
 * Why there is no transcript to show, in plain words, and whether one can
 * be made now. Pure and isomorphic.
 * @module utils/transcript/missing
 */

/**
 * @typedef {Object} MissingReason
 * @property {string} title
 * @property {string} detail
 * @property {boolean} canTranscribe - Offer the "Transcribe" button
 */

const NOTES = {
  title: 'Titles are text already — there is nothing to transcribe.',
  element:
    'A brand element is drawn by the brand kit — its words are typed in the Inspector, and there is nothing to transcribe.',
  image: 'A still image has no sound to transcribe.',
  placeholder: 'A placeholder has no media yet.',
};

/**
 * @param {{ file: string, note?: string }} subject - What the panel points at
 * @param {{ type?: string, hasAudio?: boolean }|null} item - Its MediaItem, when known
 * @param {Record<string, any>|null} sidecar - Its sidecar, when loaded
 * @param {Record<string, any>|null} status - GET /intelligence/status, when known
 * @returns {MissingReason}
 */
export function explainMissing(subject, item, sidecar, status) {
  if (!subject.file) {
    const detail = NOTES[subject.note] || 'Select a clip with speech, or pick a file above.';
    return { title: 'No transcript to show', detail, canTranscribe: false };
  }
  const silent = item && (item.type === 'image' || item.type === 'text' || item.hasAudio === false);
  if (silent || sidecar?.hasAudio === false) {
    return {
      title: 'Nothing to transcribe',
      detail: 'This file has no sound.',
      canTranscribe: false,
    };
  }
  const provider = status?.transcription;
  if (provider && provider.available === false) {
    const name = provider.provider && provider.provider !== 'auto' ? ` (${provider.provider})` : '';
    return {
      title: 'Transcription is not available',
      detail: `No transcription provider${name} is usable on this server: ${provider.detail || 'none is configured'}. Set one up as described in docs/app-spec/INTELLIGENCE.md, then try again.`,
      canTranscribe: false,
    };
  }
  if (Array.isArray(sidecar?.transcript) || sidecar?.segments?.length === 0) {
    return {
      title: 'No speech found',
      detail: 'This file was transcribed, but no words were recognised.',
      canTranscribe: true,
    };
  }
  return {
    title: 'Not transcribed yet',
    detail:
      'Transcribe this file to edit it by text: click words to move the playhead, select them to cut.',
    canTranscribe: true,
  };
}
