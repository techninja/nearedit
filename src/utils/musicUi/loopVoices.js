/**
 * The voices of the loop player (`loopPlayer.js`): one source node with
 * its own gain for every pass through the looped bars. A voice is put on
 * the audio clock ahead of time, retired with a short fade (or left to
 * ring out), cancelled while it is still unheard, and swept away once it
 * is silent.
 * @module utils/musicUi/loopVoices
 */

/**
 * A rendered song ready to play.
 * @typedef {Object} Take
 * @property {AudioBuffer} buffer - The whole song, tail included
 * @property {number[]} bars - Seconds of every bar line of the song
 */

/**
 * @typedef {Object} Voice
 * @property {AudioBufferSourceNode} source
 * @property {GainNode} gain
 * @property {number[]} bars - Bar lines of the song it plays
 * @property {number} t0 - Audio-clock time at which it plays song time `s0`
 * @property {number} s0 - Seconds into the song
 * @property {number} from - Audio-clock time it starts to sound
 * @property {number} end - Audio-clock time it reaches the end of the loop
 * @property {number} until - Audio-clock time it is silent from; Infinity while it plays on
 * @property {boolean} rings - Its loop ends where the music ends: what follows is its tail
 */

/** Seconds of the cross-fade between two voices. */
export const FADE = 0.012;
/** Seconds after `until` that a voice is kept before it is stopped for good. */
const LINGER = 0.05;

/**
 * Put a voice on the clock.
 * @param {AudioContext} ctx
 * @param {AudioNode} output
 * @param {Take} take
 * @param {{ at: number, bar: number, loop: number[] }} plan - `at`: when it
 *   plays the start of bar `bar`. It fades in just before that, from the
 *   music before the bar, so a sound held over the bar line does not click;
 *   the very start of a song has nothing before it and simply starts
 * @returns {Voice}
 */
export function launchVoice(ctx, output, take, { at, bar, loop }) {
  const s0 = take.bars[bar];
  const lead = s0 >= FADE && at - FADE > ctx.currentTime ? FADE : 0;
  const source = ctx.createBufferSource();
  const gain = ctx.createGain();
  source.buffer = take.buffer;
  source.connect(gain);
  gain.connect(output);
  gain.gain.setValueAtTime(lead ? 0 : 1, at - lead);
  if (lead) gain.gain.linearRampToValueAtTime(1, at);
  source.start(at - lead, s0 - lead);
  const last = take.bars.length - 1;
  return {
    ...{ source, gain, bars: take.bars, t0: at, s0, from: at - lead },
    end: at + (take.bars[Math.min(loop[1], last)] - s0),
    until: Infinity,
    rings: loop[1] >= last,
  };
}

/**
 * Let a voice end: silent from `at`, reached by a short fade — unless it
 * is left to ring out, which a voice at the end of the music does when the
 * loop starts again.
 * @param {Voice} voice
 * @param {number} at - Audio-clock time
 * @param {boolean} ring - Leave it to play its tail
 */
export function retireVoice(voice, at, ring) {
  if (ring) return void (voice.until = at + (voice.source.buffer?.duration || 0));
  voice.gain.gain.setValueAtTime(1, Math.max(0, at - FADE));
  voice.gain.gain.linearRampToValueAtTime(0, at);
  voice.until = at;
}

/**
 * Fade a voice out now and stop it: for Stop, which may come at any moment.
 * @param {Voice} voice
 * @param {number} now - Audio-clock time
 */
export function stopVoice(voice, now) {
  const { gain } = voice.gain;
  gain.cancelScheduledValues(now);
  gain.setValueAtTime(voice.from > now ? 0 : 1, now);
  gain.linearRampToValueAtTime(0, now + FADE);
  voice.until = now + FADE;
  voice.source.onended = () => voice.gain.disconnect();
  voice.source.stop(now + FADE + 0.005);
}

/**
 * Stop a voice for good.
 * @param {Voice} voice
 */
function dropVoice(voice) {
  try {
    voice.source.stop();
  } catch (err) {
    // Already stopped by reaching the end of its buffer: nothing to do.
    console.debug('[audition] a voice had ended:', err.message);
  }
  voice.source.disconnect();
  voice.gain.disconnect();
}

/**
 * Forget what was planned after the voice that is heard now: voices that
 * have not started are dropped, and the heard one plays on as if nothing
 * had been planned for it.
 * @param {Voice[]} voices
 * @param {Voice} heard
 * @param {number} now - Audio-clock time
 * @returns {Voice[]} The voices that remain
 */
export function cancelVoices(voices, heard, now) {
  const index = voices.indexOf(heard);
  for (const voice of voices.slice(index + 1)) dropVoice(voice);
  if (heard.until < Infinity) {
    heard.gain.gain.cancelScheduledValues(now);
    heard.gain.gain.setValueAtTime(1, now);
  }
  heard.until = Infinity;
  return voices.slice(0, index + 1);
}

/**
 * Drop the voices that have been silent for a moment.
 * @param {Voice[]} voices
 * @param {number} now - Audio-clock time; Infinity drops all
 * @returns {Voice[]} The voices that remain
 */
export function sweepVoices(voices, now) {
  const done = voices.filter((voice) => voice.until + LINGER < now);
  for (const voice of done) dropVoice(voice);
  return voices.filter((voice) => !done.includes(voice));
}
