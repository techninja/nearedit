/**
 * The command line chrome-headless-shell is started with. Pure.
 *
 * Two flags make frame-by-frame recording possible at all:
 * `--enable-begin-frame-control` (nothing is drawn until the recorder asks)
 * and `--run-all-compositor-stages-before-draw` (a frame that is asked for
 * is complete). The device scale has to be given here: the protocol's own
 * override does not enlarge what a screenshot captures.
 * @module api/web/flags
 */

/** Drawing that depends on nothing but the frame asked for. */
const DETERMINISTIC = [
  '--enable-begin-frame-control',
  '--run-all-compositor-stages-before-draw',
  '--disable-threaded-animation',
  '--disable-threaded-scrolling',
  '--disable-checker-imaging',
  '--disable-new-content-rendering-timeout',
  '--disable-image-animation-resync',
  '--disable-gpu',
  '--disable-lcd-text',
  '--force-color-profile=srgb',
  '--hide-scrollbars',
];

/** A browser that does nothing on its own: no updates, no sync, no prompts. */
const QUIET = [
  '--no-first-run',
  '--no-default-browser-check',
  '--mute-audio',
  '--disable-background-networking',
  '--disable-component-update',
  '--disable-default-apps',
  '--disable-extensions',
  '--disable-sync',
  '--disable-breakpad',
  '--disable-client-side-phishing-detection',
  '--disable-domain-reliability',
  '--disable-features=Translate,MediaRouter,OptimizationHints,InterestFeedContentSuggestions',
  '--disable-background-timer-throttling',
  '--disable-backgrounding-occluded-windows',
  '--disable-renderer-backgrounding',
  '--disable-hang-monitor',
  '--disable-popup-blocking',
  '--metrics-recording-only',
  '--no-pings',
  '--password-store=basic',
  '--use-mock-keychain',
  '--deny-permission-prompts',
];

/**
 * Everything goes through the recorder's own proxy (`proxy.js`), loopback
 * included; the browser resolves no name and opens no connection by itself.
 * @param {number} port
 * @returns {string[]}
 */
const viaProxy = (port) => [
  `--proxy-server=http://127.0.0.1:${port}`,
  '--proxy-bypass-list=<-loopback>',
  '--host-resolver-rules=MAP * ~NOTFOUND , EXCLUDE 127.0.0.1',
  '--disable-quic',
  '--force-webrtc-ip-handling-policy=disable_non_proxied_udp',
];

/**
 * @param {Object} how
 * @param {string} how.profileDir - A fresh, private profile folder
 * @param {number} how.width - Viewport, CSS pixels
 * @param {number} how.height
 * @param {number} how.scale - Device pixels per CSS pixel
 * @param {boolean} [how.noSandbox] - `WEB_CAPTURE_NO_SANDBOX=1`: only for containers and root
 * @param {boolean} [how.smallShm] - `/dev/shm` is too small for Chrome's bitmaps (Docker's 64 MB)
 * @param {number} [how.proxyPort] - The recorder's proxy; without one the browser may load nothing
 * @returns {string[]}
 */
export function browserArgs(how) {
  const { profileDir, width, height, scale, noSandbox, smallShm, proxyPort } = how;
  return [
    '--remote-debugging-port=0',
    '--remote-debugging-pipe',
    `--user-data-dir=${profileDir}`,
    `--window-size=${Math.round(width)},${Math.round(height)}`,
    `--force-device-scale-factor=${scale}`,
    ...DETERMINISTIC,
    ...QUIET,
    ...(proxyPort ? viaProxy(proxyPort) : ['--proxy-server=http://127.0.0.1:9']),
    ...(noSandbox ? ['--no-sandbox'] : []),
    ...(smallShm ? ['--disable-dev-shm-usage'] : []),
    'about:blank',
  ];
}
