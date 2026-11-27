/**
 * The "park" fixture project shared by the director tests: an interview
 * with pauses, a voice-over, b-roll with shots, stills and a music bed.
 * @module api/director/testing/park
 */

import { beatGrid, createProject, say } from './fixtures.js';

/** Interview words: three sentences separated by pauses of 2s and 1.5s. */
export const INTERVIEW_WORDS = [
  ...say('we arrived at the park early in the morning', { start: 1 }),
  ...say('the dog ran straight to the beach', { start: 6.6 }),
  ...say('then we walked back through the city', { start: 10.9 }),
];

/** Voice-over words: two sentences with a 2s pause between them. */
export const VOICE_WORDS = say('the beach was empty | the city was waking up', { start: 0.5 });

/**
 * Create the park project (about a second of ffmpeg work).
 * @param {{ resolution?: string, fps?: number, aspectRatio?: string }} [format]
 * @returns {Promise<import('./fixtures.js').TestProject>}
 */
export function createParkProject(format) {
  return createProject(
    {
      'interview.mp4': {
        duration: 16,
        sidecar: {
          transcript: INTERVIEW_WORDS,
          tags: ['interview'],
          scenes: [{ start: 0, end: 16 }],
        },
      },
      'voice.wav': { duration: 8, sidecar: { transcript: VOICE_WORDS } },
      'broll/beach.mp4': {
        duration: 8,
        sidecar: {
          tags: ['beach', 'dog', 'sea'],
          description: 'A dog runs along an empty beach.',
          scenes: [
            { start: 0, end: 3 },
            { start: 3, end: 8 },
          ],
          keyframes: [{ time: 5, tags: ['dog', 'running'] }],
        },
      },
      'broll/city.mp4': {
        duration: 6,
        audio: false,
        sidecar: {
          tags: ['city', 'street', 'traffic'],
          description: 'Morning traffic in the city.',
        },
      },
      'stills/sign.png': { size: '640x480', sidecar: { tags: ['park', 'sign'] } },
      'stills/tall.png': { size: '480x960', sidecar: false },
      'music/bed.wav': { duration: 30, sidecar: { beats: beatGrid(120, 30), bpm: 120 } },
      // No transcript: only detected silences (1.5–3.5s and 5–6s).
      'voice-memo.wav': {
        duration: 8,
        sidecar: {
          silences: [
            { start: 1.5, end: 3.5 },
            { start: 5, end: 6 },
          ],
        },
      },
    },
    format,
  );
}
