/**
 * Planning a cutout and finding its matte program, without running either:
 * the picture's size, the FFmpeg arguments — the renderer's frame rule in
 * both of them — and the command line of the worker.
 */
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import * as cutout from '../../src/api/cutout/index.js';
import { conformFilters, holdFilters, openInput } from '../../src/api/render/conform.js';
import { getConfig } from '../../src/api/lib/config.js';

const { matteSmoothing, pictureSize, planCutout, splitCommand } = cutout;
const HD = { hasVideo: true, width: 1920, height: 1080, pixFmt: 'yuv420p' };

describe('the plan of a cutout', () => {
  it('keeps the picture at the size it is shown, inside 1920 × 1080, with even sides', () => {
    assert.deepEqual(pictureSize({ width: 1280, height: 720 }), { width: 1280, height: 720 });
    assert.deepEqual(pictureSize({ width: 3840, height: 2160 }), { width: 1920, height: 1080 });
    assert.deepEqual(pictureSize({ width: 1080, height: 1920 }), { width: 608, height: 1080 });
    assert.deepEqual(pictureSize({ width: 2560, height: 1080 }), { width: 1920, height: 810 });
    assert.deepEqual(pictureSize({ width: 853, height: 479 }), { width: 854, height: 480 });
    assert.deepEqual(pictureSize({ width: 1, height: 1 }), { width: 2, height: 2 });
  });

  it('softens the matte by a third of its enlargement, and not at all when it is not enlarged', () => {
    assert.equal(matteSmoothing({ width: 1920, height: 1080 }), 1.25);
    assert.equal(matteSmoothing({ width: 1280, height: 720 }), 0.83);
    assert.equal(matteSmoothing({ width: 320, height: 180 }), 0);
  });

  it('opens the file and picks frames exactly as the renderer does, at both ends', () => {
    const timing = { fps: 30, fpsText: '30' };
    const plan = planCutout({ file: '/m/a.mp4', probe: HD, start: 12.5, frames: 90, fps: 30 });
    const { args, lead } = openInput('/m/a.mp4', false, { seek: 12.5, count: 90 }, 30);
    const rule = [...conformFilters({ lead }, timing), ...holdFilters(90, 30)].join(',');
    const packer = plan.packer('/out/x.part');
    const input = args.join(' ');
    assert.ok(plan.decoder.args.join(' ').includes(input) && packer.args.join(' ').includes(input));
    const decodeChain = plan.decoder.args[plan.decoder.args.indexOf('-vf') + 1];
    const graph = packer.args[packer.args.indexOf('-filter_complex') + 1];
    assert.ok(decodeChain.startsWith(`${rule},scale=w=1920:h=1080:in_color_matrix=bt709:`));
    assert.ok(graph.startsWith(`[0:v:0]${rule},scale=w=1920:h=1080:in_color_matrix=bt709:`));
    assert.ok(decodeChain.endsWith('setsar=1,format=rgb24'));
    assert.deepEqual([plan.width, plan.height], [1920, 1080]);
    assert.deepEqual([plan.frameBytes, plan.matteBytes], [1920 * 1080 * 3, 1920 * 1080]);
  });

  it('packs side by side into H.264 that scrubs, in the matrix of the source', () => {
    const probe = { ...HD, width: 640, height: 360 };
    const plan = planCutout({ file: '/m/a.mp4', probe, start: 0, frames: 50, fps: 25 });
    const args = plan.packer('/out/x.part').args.join(' ');
    assert.match(args, /-f rawvideo -pix_fmt gray -video_size 640x360 -framerate 25 -i pipe:0/);
    assert.match(args, /\[p\]\[m\]hstack=inputs=2:shortest=1\[v\]/);
    assert.match(
      args,
      /-c:v libx264 -preset veryfast -crf 16 -profile:v high -pix_fmt yuv420p -r 25 -g 13 /,
    );
    assert.match(args, /out_color_matrix=bt601.*-colorspace smpte170m .*-color_range tv/);
    assert.match(args, /gblur=sigma=0\.42/);
    assert.ok(args.endsWith('-movflags +faststart -map_metadata -1 -f mp4 /out/x.part'));
    assert.ok(!/-c:a|-map 0:a/.test(args) && args.includes(' -an '), 'no sound');
    const hd = planCutout({ file: '/m/a.mp4', probe: HD, start: 0, frames: 1, fps: 29.97 });
    const wide = hd.packer('/o.part').args.join(' ');
    assert.match(wide, /out_color_matrix=bt709.*-r 30000\/1001 -g 15 -colorspace bt709 /);
  });
});

describe('the matte program', () => {
  const env = ['CUTOUT_COMMAND', 'CUTOUT_PYTHON', 'CUTOUT_MODEL', 'FASTER_WHISPER_PYTHON'];
  const saved = Object.fromEntries(env.map((name) => [name, process.env[name]]));
  afterEach(() => {
    for (const name of env) {
      if (saved[name] === undefined) delete process.env[name];
      else process.env[name] = saved[name];
    }
  });

  it('splits a command line into words without a shell', () => {
    assert.deepEqual(splitCommand('matte --gpu 0'), ['matte', '--gpu', '0']);
    assert.deepEqual(splitCommand('  "/opt/my tools/matte" --name \'two words\'  x'), [
      ...['/opt/my tools/matte', '--name', 'two words', 'x'],
    ]);
    assert.deepEqual(splitCommand('a\\ b "c \\"d\\"" \'C:\\tools\\m.exe\' ""'), [
      ...['a b', 'c "d"', 'C:\\tools\\m.exe', ''],
    ]);
    assert.deepEqual(splitCommand('run; rm -rf $HOME | `x`'), [
      'run;',
      'rm',
      '-rf',
      '$HOME',
      '|',
      '`x`',
    ]);
    assert.deepEqual(splitCommand('   '), []);
  });

  it("is the built-in worker with CUTOUT_PYTHON, else the transcriber's Python, else python3", () => {
    for (const name of env) delete process.env[name];
    assert.equal(cutout.findProvider().python, 'python3');
    process.env.FASTER_WHISPER_PYTHON = '/env/bin/python';
    assert.equal(cutout.findProvider().python, '/env/bin/python');
    process.env.CUTOUT_PYTHON = '/cut/bin/python';
    const provider = cutout.findProvider();
    const model = join(getConfig().dataDir, 'models', 'modnet.onnx');
    assert.deepEqual(
      { ...provider, words: provider.words.slice(0, 2) },
      {
        ...{ kind: 'builtin', words: ['/cut/bin/python', cutout.WORKER_SCRIPT] },
        ...{ python: '/cut/bin/python', modelFile: model, command: '', chosen: false },
      },
    );
    assert.deepEqual(cutout.matteCommand(provider, { width: 1280, height: 720, fps: 30 }), {
      cmd: '/cut/bin/python',
      args: [
        ...[cutout.WORKER_SCRIPT, '--model', model, '--size', '512', '--steady', '0.6'],
        ...['--width', '1280', '--height', '720', '--fps', '30'],
      ],
    });
  });

  it("reads the model from CUTOUT_MODEL, else the data folder, else NearEdit's own", () => {
    const data = mkdtempSync(join(tmpdir(), 'nearedit-cutout-plan-'));
    const [before, own] = [process.env.NEAREDIT_DATA_DIR, resolve('data/models/modnet.onnx')];
    try {
      for (const name of env) delete process.env[name];
      process.env.NEAREDIT_DATA_DIR = data;
      const installed = join(data, 'models', 'modnet.onnx');
      const fallback = cutout.findProvider().modelFile;
      assert.ok(
        [installed, own].includes(fallback),
        'the place install-cutout fills, or the own copy',
      );
      mkdirSync(join(data, 'models'));
      writeFileSync(installed, 'x');
      assert.equal(cutout.findProvider().modelFile, installed);
      process.env.CUTOUT_MODEL = 'elsewhere/m.onnx';
      const chosen = cutout.findProvider();
      assert.deepEqual([chosen.modelFile, chosen.chosen], [resolve('elsewhere/m.onnx'), true]);
    } finally {
      if (before === undefined) delete process.env.NEAREDIT_DATA_DIR;
      else process.env.NEAREDIT_DATA_DIR = before;
      rmSync(data, { recursive: true, force: true });
    }
  });

  it('is CUTOUT_COMMAND when that is set, with the frame size and rate added', () => {
    process.env.CUTOUT_COMMAND = ' "/opt/my matte/run" --gpu 0 ';
    const provider = cutout.findProvider();
    assert.deepEqual([provider.kind, provider.command], ['command', '"/opt/my matte/run" --gpu 0']);
    assert.deepEqual(
      cutout.matteCommand(provider, { width: 640, height: 360, fps: 30000 / 1001 }),
      {
        cmd: '/opt/my matte/run',
        args: ['--gpu', '0', '--width', '640', '--height', '360', '--fps', String(30000 / 1001)],
      },
    );
  });
});
