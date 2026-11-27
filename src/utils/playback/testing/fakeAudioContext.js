/**
 * Fake AudioContext for Node tests of the audio mixer: a settable clock
 * and audio parameters that record their automation.
 * @module utils/playback/testing/fakeAudioContext
 */

/** An AudioParam that records every automation call. */
export class FakeParam {
  value = 1;
  /** @type {{ type: string, value: number, time: number }[]} */
  events = [];
  cancels = 0;

  /** Drop everything scheduled. */
  cancelScheduledValues() {
    this.events = [];
    this.cancels++;
  }

  /**
   * @param {number} value
   * @param {number} time
   */
  setValueAtTime(value, time) {
    this.events.push({ type: 'set', value, time });
  }

  /**
   * @param {number} value
   * @param {number} time
   */
  linearRampToValueAtTime(value, time) {
    this.events.push({ type: 'ramp', value, time });
  }

  /** @param {number} value */
  setTargetAtTime(value) {
    this.value = value;
  }
}

/** A node that can be connected and disconnected. */
export class FakeNode {
  gain = new FakeParam();
  connections = 0;

  /** Connect to anything. */
  connect() {
    this.connections++;
  }

  /** Disconnect from everything. */
  disconnect() {
    this.connections = 0;
  }
}

/** A running AudioContext whose clock the test moves. */
export class FakeAudioContext {
  /** @type {FakeAudioContext|null} The most recently created context */
  static last = null;

  state = 'running';
  currentTime = 100;
  destination = new FakeNode();

  constructor() {
    FakeAudioContext.last = this;
  }

  /** @returns {FakeNode} */
  createGain() {
    return new FakeNode();
  }

  /** @returns {FakeNode} */
  createAnalyser() {
    return new FakeNode();
  }

  /** @returns {FakeNode} */
  createMediaElementSource() {
    return new FakeNode();
  }

  /** @returns {Promise<void>} */
  resume() {
    this.state = 'running';
    return Promise.resolve();
  }

  /** @returns {Promise<void>} */
  suspend() {
    this.state = 'suspended';
    return Promise.resolve();
  }
}

/**
 * Install the fake as the global AudioContext.
 * @returns {void}
 */
export function installFakeAudio() {
  /** @type {any} */ (globalThis).AudioContext = FakeAudioContext;
}
