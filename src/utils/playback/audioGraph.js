/**
 * Audio graph — the one AudioContext of the app, its master gain and a
 * level meter:  voice gains → master gain → destination
 *                                  └────→ analyser (meter tap)
 * Created lazily on the first Play, because browsers only let an
 * AudioContext start from a user gesture.
 * @module utils/playback/audioGraph
 */

/**
 * @typedef {Object} AudioGraph
 * @property {AudioContext} ctx
 * @property {GainNode} master
 * @property {AnalyserNode} analyser
 */

const METER_SAMPLES = 1024;
const SMOOTHING_SECONDS = 0.015;

/** @type {AudioGraph|null} */
let graph = null;
let masterVolume = 1;
const meterBuffer = new Float32Array(METER_SAMPLES);

/**
 * The shared graph, created on first use.
 * @returns {AudioGraph|null} null where Web Audio is unavailable
 */
export function getAudioGraph() {
  if (graph) return graph;
  const AudioContextClass =
    globalThis.AudioContext || /** @type {any} */ (globalThis).webkitAudioContext;
  if (!AudioContextClass) return null;
  const ctx = /** @type {AudioContext} */ (new AudioContextClass({ latencyHint: 'interactive' }));
  const master = ctx.createGain();
  master.gain.value = masterVolume;
  const analyser = ctx.createAnalyser();
  analyser.fftSize = METER_SAMPLES;
  analyser.smoothingTimeConstant = 0;
  master.connect(ctx.destination);
  master.connect(analyser);
  graph = { ctx, master, analyser };
  return graph;
}

/**
 * Ask the context to run (call from a user gesture). Resolves either way;
 * playback falls back to the wall clock while the context stays suspended.
 * @returns {Promise<void>}
 */
export function resumeAudio() {
  const ctx = getAudioGraph()?.ctx;
  if (!ctx || ctx.state === 'running') return Promise.resolve();
  return ctx
    .resume()
    .catch((err) => console.warn('[playback] audio could not start:', err.message));
}

/**
 * Suspend the context while nothing plays, so it stops using the device.
 * @returns {void}
 */
export function suspendAudio() {
  const ctx = graph?.ctx;
  if (!ctx || ctx.state !== 'running') return;
  ctx.suspend().catch((err) => console.warn('[playback] audio could not suspend:', err.message));
}

/**
 * The master clock reading.
 * @returns {number|null} AudioContext seconds, or null while it is not running
 */
export function audioClockTime() {
  return graph && graph.ctx.state === 'running' ? graph.ctx.currentTime : null;
}

/**
 * Set the master output level.
 * @param {number} volume - Linear gain, 0..2
 */
export function setMasterVolume(volume) {
  masterVolume = Math.max(0, Math.min(2, Number(volume) || 0));
  if (graph)
    graph.master.gain.setTargetAtTime(masterVolume, graph.ctx.currentTime, SMOOTHING_SECONDS);
}

/** @returns {number} Master output level, linear gain */
export function getMasterVolume() {
  return masterVolume;
}

/**
 * Read the master output level for a meter. Cheap: one 1024-sample pass,
 * meant to be called once per animation frame.
 * @returns {{ rms: number, peak: number }} Linear amplitudes, 0 = silence
 */
export function readMasterLevel() {
  if (!graph || graph.ctx.state !== 'running') return { rms: 0, peak: 0 };
  graph.analyser.getFloatTimeDomainData(meterBuffer);
  let sum = 0;
  let peak = 0;
  for (const sample of meterBuffer) {
    sum += sample * sample;
    const magnitude = Math.abs(sample);
    if (magnitude > peak) peak = magnitude;
  }
  return { rms: Math.sqrt(sum / METER_SAMPLES), peak };
}
