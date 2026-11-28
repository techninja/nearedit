/**
 * Whether there is a matte program, and what is said when there is not:
 * the built-in worker asked through stand-ins for Python (so no model is
 * needed), the real script asked without a model where there is a
 * `python3`, and a program of one's own.
 */
import { after, afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, readFileSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as cutout from '../../src/api/cutout/index.js';
import { probeCommand } from '../../src/api/cutout/probeCommand.js';
import * as kit from './kit.js';

const posix = process.platform !== 'win32';
const hasPython = spawnSync('python3', ['--version']).status === 0;

describe('cutout status', () => {
  let box;
  let model;
  const names = ['CUTOUT_COMMAND', 'CUTOUT_PYTHON', 'CUTOUT_MODEL'];
  /** A stand-in for Python: logs that it ran, says something, exits with a code. */
  const python = (code, says = '') => {
    const file = join(box.root, `python-${code}`);
    const log = `echo run >> "${join(box.root, 'python.log')}"`;
    writeFileSync(file, `#!/bin/sh\n${log}\n${says}\nexit ${code}\n`);
    chmodSync(file, 0o755);
    process.env.CUTOUT_PYTHON = file;
    return file;
  };
  const runs = () => readFileSync(join(box.root, 'python.log'), 'utf8').split('\n').length - 1;

  before(() => {
    box = kit.cutoutSandbox('cutout-status');
    model = join(box.root, 'model.onnx');
    writeFileSync(model, 'a model, as far as the stand-in can tell');
    writeFileSync(join(box.root, 'python.log'), '');
  });
  afterEach(() => names.forEach((name) => delete process.env[name]));
  after(() => box.cleanup());

  it(
    'is available when the worker loads its model, and names model and settings for the key',
    { skip: !posix },
    async () => {
      const file = python(
        0,
        `echo '{"python": "3.12.1", "onnxruntime": "1.20.0", "numpy": "2.1.0"}'`,
      );
      process.env.CUTOUT_MODEL = model;
      const digest = createHash('sha256').update(readFileSync(model)).digest('hex').slice(0, 12);
      assert.deepEqual(await cutout.cutoutStatus(), {
        ...{
          available: true,
          provider: 'builtin',
          reason: '',
          python: file,
          file: model,
          command: '',
        },
        model: `modnet-${digest}/size512/steady0.6/v1`,
        detail: `Python 3.12.1 at ${file}, onnxruntime 1.20.0, numpy 2.1.0; model ${model}`,
      });
      const { provider, model: id } = await cutout.requireProvider();
      assert.deepEqual([provider.kind, id], ['builtin', `modnet-${digest}/size512/steady0.6/v1`]);
    },
  );

  it(
    'remembers the answer until the model changes, or it is asked afresh',
    { skip: !posix },
    async () => {
      python(0, `echo '{"python": "3.12.1", "onnxruntime": "1.20.0", "numpy": "2.1.0"}'`);
      process.env.CUTOUT_MODEL = model;
      await cutout.cutoutStatus({ fresh: true });
      const count = runs();
      await cutout.cutoutStatus();
      await cutout.cutoutStatus();
      assert.equal(runs(), count, 'not asked again');
      await cutout.cutoutStatus({ fresh: true });
      assert.equal(runs(), count + 1);
      utimesSync(model, new Date(), new Date(Date.now() + 60_000));
      await cutout.cutoutStatus();
      assert.equal(runs(), count + 2, 'another file is asked about again');
    },
  );

  it('says what is missing, and the command that gets it', { skip: !posix }, async () => {
    process.env.CUTOUT_MODEL = model;
    process.env.CUTOUT_PYTHON = join(box.root, 'no-python');
    const reason = async () => (await cutout.cutoutStatus()).reason;
    assert.equal(
      await reason(),
      `No Python at "${join(box.root, 'no-python')}": set CUTOUT_PYTHON to a Python 3 that has onnxruntime and numpy.`,
    );
    let file = python(
      3,
      `echo "person_matte: missing module numpy (No module named 'numpy'): pip install onnxruntime numpy" >&2`,
    );
    assert.equal(
      await reason(),
      `Python at ${file} has no numpy: ${file} -m pip install onnxruntime numpy`,
    );
    file = python(4, `echo "person_matte: no model at ${model} (No such file or directory)" >&2`);
    assert.equal(
      await reason(),
      `No model at ${model}: put the model there, or unset CUTOUT_MODEL and run: npm run install-cutout`,
    );
    delete process.env.CUTOUT_MODEL;
    assert.match(await reason(), /^No model at .*modnet\.onnx: npm run install-cutout$/);
    process.env.CUTOUT_MODEL = model;
    python(5, `echo "person_matte: the model at ${model} does not load: INVALID_PROTOBUF" >&2`);
    assert.equal(
      await reason(),
      `Python says: the model at ${model} does not load: INVALID_PROTOBUF — download it again: npm run install-cutout -- --force`,
    );
    file = python(1, `echo "Traceback" >&2; echo "SyntaxError: this is Python 2" >&2`);
    assert.equal(
      await reason(),
      `The matte worker does not start with ${file}: SyntaxError: this is Python 2`,
    );
    const status = await cutout.cutoutStatus();
    assert.deepEqual([status.available, status.provider, status.model], [false, 'builtin', '']);
    await assert.rejects(
      cutout.requireProvider(),
      (err) => err.status === 503 && err.message === status.reason,
    );
    // A failure is not remembered: once that same Python works, the next question finds out.
    writeFileSync(
      file,
      `#!/bin/sh\necho '{"python": "3.12.1", "onnxruntime": "1.20.0", "numpy": "2.1.0"}'\n`,
    );
    assert.equal((await cutout.cutoutStatus()).available, true);
  });

  it(
    'the real worker, asked without a model, says which of the two is missing',
    { skip: !hasPython && 'no python3 here' },
    async () => {
      process.env.CUTOUT_PYTHON = 'python3';
      process.env.CUTOUT_MODEL = join(box.root, 'none.onnx');
      const none = await cutout.cutoutStatus();
      assert.equal(none.available, false);
      const lacks =
        /^Python at python3 has no (onnxruntime|numpy): python3 -m pip install onnxruntime numpy$/;
      if (lacks.test(none.reason)) return;
      assert.equal(
        none.reason,
        `No model at ${join(box.root, 'none.onnx')}: put the model there, or unset CUTOUT_MODEL and run: npm run install-cutout`,
      );
      // This Python has both: a file that is not a model is told apart from a missing one.
      process.env.CUTOUT_MODEL = model;
      assert.match(
        (await cutout.cutoutStatus()).reason,
        /^Python says: the model at .* does not load: .* — download it again: npm run install-cutout -- --force$/,
      );
    },
  );

  it(
    'the real worker refuses bad arguments before it loads anything',
    { skip: !hasPython && 'no python3 here' },
    () => {
      const run = (...args) =>
        spawnSync('python3', [cutout.WORKER_SCRIPT, ...args], { encoding: 'utf8' });
      assert.equal(run().status, 2);
      assert.match(run('--model', 'm.onnx').stderr, /--width and --height are required/);
      assert.equal(
        run('--model', 'm.onnx', '--width', '64', '--height', '64', '--size', '8').status,
        2,
      );
      assert.equal(
        run('--model', 'm.onnx', '--width', '64', '--height', '64', '--steady', '1').status,
        2,
      );
      assert.match(
        execFileSync('python3', [cutout.WORKER_SCRIPT, '--help'], { encoding: 'utf8' }),
        /--check/,
      );
    },
  );

  it("is a program of one's own when CUTOUT_COMMAND is set", async () => {
    const command = kit.useFake(box);
    const status = await cutout.cutoutStatus();
    assert.deepEqual(
      [status.available, status.provider, status.model, status.reason, status.command],
      [true, 'command', `command:${command}`, '', command],
    );
    // One that takes frames and never answers is not waited for for ever.
    kit.useFake(box, '--hang-after 1');
    const stuck = await probeCommand(cutout.findProvider(), 800);
    assert.match(stuck.reason, /^CUTOUT_COMMAND did not answer two 64 × 64 frames within 1 s\.$/);
    assert.deepEqual(kit.leftovers(box.root), [], 'and it is not left running');
  });
});
