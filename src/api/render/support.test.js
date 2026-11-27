import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseCapabilities } from './capabilities.js';
import { RenderError } from './errors.js';
import { getPreset, listPresets, outputSize } from './presets.js';
import { createProgressReader } from './progress.js';
import { describeSource, parseSar, sourceMatrix } from './sources.js';
import { isRenderName, sanitizeFilename } from './store.js';

describe('render: sources and capabilities', () => {
  it('describes sources by what the viewer sees', () => {
    const phone = describeSource({
      hasVideo: true,
      hasAudio: true,
      width: 1920,
      height: 1080,
      rotation: -90,
      channels: 1,
    });
    assert.deepEqual([phone.width, phone.height, phone.channels], [1080, 1920, 1]);
    const dv = describeSource({ hasVideo: true, width: 720, height: 576, sar: '16:15' });
    assert.deepEqual([dv.width, dv.height, dv.anamorphic, dv.hasAudio], [768, 576, true, false]);
    assert.equal(describeSource({ hasAudio: true }).hasVideo, false);
    assert.equal(describeSource(null).hasVideo, false);
    assert.deepEqual([parseSar('4:3'), parseSar('0:1'), parseSar(undefined)], [4 / 3, 1, 1]);
  });

  it('chooses the colour matrix from tags, codec, then size', () => {
    assert.equal(sourceMatrix({ colorSpace: 'bt709', height: 480 }), 'bt709');
    assert.equal(sourceMatrix({ colorSpace: 'smpte170m', height: 2160 }), 'bt601');
    assert.equal(sourceMatrix({ colorSpace: 'bt2020nc', height: 2160 }), 'bt2020');
    assert.equal(sourceMatrix({ pixFmt: 'yuvj420p', codec: 'mjpeg', height: 3000 }), 'bt601');
    assert.equal(sourceMatrix({ pixFmt: 'yuv420p', height: 1080 }), 'bt709');
    assert.equal(sourceMatrix({ pixFmt: 'yuv420p', height: 480 }), 'bt601');
    assert.equal(sourceMatrix({ pixFmt: 'rgba', height: 1080 }), '');
  });

  it('reads FFmpeg capabilities from its own output', () => {
    const encoder = 'Encoder libx264 [libx264 H.264]';
    const limiter = 'Filter alimiter\n   latency  <boolean>';
    const six = parseCapabilities({
      version: 'ffmpeg version 6.1.1-3ubuntu5\nconfiguration: --enable-libfontconfig',
      encoder,
      limiter,
    });
    assert.deepEqual(six, {
      version: '6.1.1',
      libx264: true,
      limiterLatency: true,
      graphFlag: '-filter_complex_script',
    });
    const seven = parseCapabilities({
      version: 'ffmpeg version n7.1 Copyright',
      encoder: "Codec 'libx264' is not recognized",
    });
    assert.deepEqual(
      [seven.version, seven.graphFlag, seven.libx264],
      ['7.1', '-/filter_complex', false],
    );
    assert.equal(seven.limiterLatency, false, 'an old alimiter has no latency option');
    const git = parseCapabilities({ version: 'ffmpeg version N-118000-gabc', encoder });
    assert.deepEqual([git.version, git.graphFlag, git.libx264], ['', '-/filter_complex', true]);
  });
});

describe('render: presets, names and progress', () => {
  it('describes the presets', () => {
    assert.deepEqual(
      listPresets().map((p) => p.id),
      ['draft', 'standard', 'high'],
    );
    assert.equal(getPreset().id, 'standard');
    assert.equal(getPreset('nope'), null);
    assert.deepEqual(outputSize({ width: 1918, height: 1081 }, getPreset('draft')), {
      width: 960,
      height: 540,
    });
    assert.deepEqual(outputSize({ width: 1081, height: 1921 }, getPreset('high')), {
      width: 1082,
      height: 1922,
    });
  });

  it('sanitises output names and never lets a path through', () => {
    assert.equal(sanitizeFilename('My Cut (final).mp4'), 'My Cut (final).mp4');
    assert.equal(sanitizeFilename('héllo wörld'), 'héllo wörld.mp4');
    assert.equal(sanitizeFilename('a:b*c?"<>|'), 'a_b_c_____.mp4');
    assert.equal(sanitizeFilename('...'), 'render.mp4');
    assert.equal(sanitizeFilename('x'.repeat(300)).length, 124);
    for (const bad of ['../x', 'a/b', 'a\\b', '/etc/passwd', 'a\0b'])
      assert.throws(
        () => sanitizeFilename(bad),
        (err) => err instanceof RenderError && err.status === 422,
        bad,
      );
    for (const name of ['a.mp4', 'My Cut-2.MP4']) assert.ok(isRenderName(name), name);
    for (const name of [
      '',
      'a.json',
      '.a.mp4',
      '../a.mp4',
      'd/a.mp4',
      'd\\a.mp4',
      'a.mp4/',
      7,
      null,
    ])
      assert.ok(!isRenderName(name), String(name));
  });

  it('turns -progress output into whole percents and keeps real errors', () => {
    const seen = [];
    const reader = createProgressReader(10, (percent) => seen.push(percent));
    for (const line of [
      'frame=30',
      'out_time_us=1000000',
      'out_time_ms=1000000',
      'out_time=00:00:01.000000',
      'progress=continue',
      '[h264 @ 0x1] error while decoding MB',
      'out_time_us=1050000',
      'out_time_us=5550000',
      'out_time_us=99000000',
      'speed=2.5x',
    ])
      reader.line(line);
    assert.deepEqual(seen, [10, 55, 99]);
    assert.deepEqual(reader.errors, ['[h264 @ 0x1] error while decoding MB']);
  });
});
