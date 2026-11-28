/**
 * A stand-in for Web Audio in tests of the audition: a context whose clock
 * the test moves, buffers that hold real samples, and source and gain
 * nodes that record what was asked of them — so a test can say when each
 * pass of a loop was put on the clock, from where in the song, and how it
 * was faded. Not part of the runtime — import it from tests.
 * @module utils/musicUi/testing/fakeAudio
 */

/** An AudioParam that records its automation. */
class FakeParam {
  value = 1;
  /** @type {{ type: 'set'|'ramp'|'cancel', value: number, time: number }[]} */
  events = [];

  /** @param {number} value @param {number} time */
  setValueAtTime(value, time) {
    this.events.push({ type: 'set', value, time });
  }

  /** @param {number} value @param {number} time */
  linearRampToValueAtTime(value, time) {
    this.events.push({ type: 'ramp', value, time });
  }

  /** @param {number} time */
  cancelScheduledValues(time) {
    this.events = this.events.filter((event) => event.time < time);
    this.events.push({ type: 'cancel', value: 0, time });
  }
}

/** A node that remembers whether it is connected. */
class FakeNode {
  gain = new FakeParam();
  connected = 0;

  /** Connect to anything. */
  connect() {
    this.connected += 1;
  }

  /** Disconnect from everything. */
  disconnect() {
    this.connected = 0;
  }
}

/** A buffer source that records its start and stop. */
class FakeSource extends FakeNode {
  /** @type {any} */
  buffer = null;
  /** @type {{ when: number, offset: number }|null} */
  started = null;
  /** @type {number|null} */
  stopped = null;
  /** @type {(() => void)|null} */
  onended = null;

  /** @param {number} [when] @param {number} [offset] */
  start(when = 0, offset = 0) {
    this.started = { when, offset };
  }

  /** @param {number} [when] */
  stop(when = 0) {
    this.stopped = when;
  }
}

/** A context whose clock the test moves; `state` starts as given. */
export class FakeAudioContext {
  currentTime = 10;
  sampleRate = 48000;
  destination = new FakeNode();
  /** @type {FakeSource[]} Every source ever made, in order */
  sources = [];

  /** @param {'running'|'suspended'} [state] */
  constructor(state = 'running') {
    this.state = state;
    /** Whether `resume()` is allowed to start the context (a user gesture was seen). */
    this.allowed = true;
  }

  /** @returns {FakeNode} */
  createGain() {
    return new FakeNode();
  }

  /** @returns {FakeSource} */
  createBufferSource() {
    const source = new FakeSource();
    this.sources.push(source);
    return source;
  }

  /**
   * @param {number} channels
   * @param {number} length
   * @param {number} sampleRate
   * @returns {any} Enough of an AudioBuffer
   */
  createBuffer(channels, length, sampleRate) {
    const data = Array.from({ length: channels }, () => new Float32Array(length));
    return {
      ...{ length, sampleRate, numberOfChannels: channels, duration: length / sampleRate },
      getChannelData: (/** @type {number} */ channel) => data[channel],
    };
  }

  /** @returns {Promise<void>} */
  async resume() {
    if (this.allowed) this.state = 'running';
  }

  /** @returns {Promise<void>} */
  async suspend() {
    this.state = 'suspended';
  }
}

/**
 * An audio host for `setAuditionHost`: the fake context, straight to its destination.
 * @param {FakeAudioContext} ctx
 * @returns {import('#utils/musicUi/auditionHost.js').AuditionHost & { idled: number }}
 */
export function fakeHost(ctx) {
  return {
    idled: 0,
    context: () => /** @type {any} */ (ctx),
    output: () => /** @type {any} */ (ctx.destination),
    resume: () => ctx.resume(),
    /** Count the times the audition said it was done with the device. */
    idle() {
      this.idled += 1;
    },
  };
}
