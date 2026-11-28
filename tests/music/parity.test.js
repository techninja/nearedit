/**
 * Cross-runtime parity — what music clips rest on: the same song rendered
 * by the engine in Node and in real Chromium comes out as the same samples,
 * bit for bit. So the audition in the editor and the file the server writes
 * are one sound, and a rendering's key means the same everywhere.
 *
 * Chromium is launched through the project's Playwright (`CHROMIUM_PATH`
 * picks the binary when set) and imports the engine from a throwaway static
 * server over `src/`, through the app's import map. Without a browser every
 * case is skipped, saying why.
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { arithmeticPrint, eightParts } from '../../src/utils/music/engine/testSongs.js';
import { createRenderer, renderSong, songKey } from '../../src/utils/music/index.js';
import { sha256 } from '../../src/utils/web/sha256.js';
import { openBrowser } from './browser.js';
import { SONGS } from './songs.js';

let browser;
let skipped = '';
const lines = [];

/** The fingerprint of a song's samples as Node renders them. */
function nodeRender(song) {
  const samples = renderSong(song);
  return { frames: samples.length / 2, sha: sha256(new Uint8Array(samples.buffer)), samples };
}

describe('music parity: Node vs Chromium', () => {
  before(async () => {
    try {
      browser = await openBrowser();
    } catch (err) {
      const why = String(err?.message || err).split('\n')[0];
      skipped = `no browser could be launched (${why}); set CHROMIUM_PATH to a Chromium binary`;
    }
  });

  after(async () => {
    await browser?.close();
    if (lines.length)
      console.log(
        `\nmusic parity (Chromium ${browser?.version}, Node ${process.version})\n${lines.join('\n')}`,
      );
  });

  it("the engine's own arithmetic gives the same bits", async (t) => {
    if (skipped) return t.skip(skipped);
    assert.equal(await browser.arithmetic(), arithmeticPrint(), 'sin, exp, 2^x, tan, clip, random');
  });

  for (const [name, song] of [...Object.entries(SONGS), ['eight parts', eightParts(2)]]) {
    it(`renders "${name}" to the same samples`, async (t) => {
      if (skipped) return t.skip(skipped);
      const here = nodeRender(song);
      // The browser takes the song in odd chunks; Node took it whole.
      const there = await browser.render(song, 977);
      lines.push(
        `  ${name.padEnd(36)} ${here.frames} frames  ${here.sha.slice(0, 16)}  ${there.sha === here.sha ? 'identical' : 'DIFFERENT'}`,
      );
      assert.equal(there.frames, here.frames);
      assert.equal(there.sha, here.sha, 'every sample, every bit');
      assert.equal(there.key, songKey(song), 'and the key of the rendering');
      assert.equal(createRenderer(song).frames, here.frames);
      assert.ok(
        here.samples.some((x) => Math.abs(x) > 0.05),
        'the song is not silence',
      );
    });
  }

  it('tells different songs apart (the comparison is not vacuous)', async (t) => {
    if (skipped) return t.skip(skipped);
    const [song] = Object.values(SONGS);
    const other = { ...song, swing: 0.01 };
    const there = await browser.render(other, 4096);
    assert.notEqual(there.sha, nodeRender(song).sha);
    assert.equal(there.sha, nodeRender(other).sha);
  });
});
