/**
 * The model installer, against a stand-in for the download server on this
 * machine: what is saved, what is refused, and what the script says about
 * the Python side. The real download is not part of the tests.
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MODEL_BYTES, MODEL_URL, installModel } from '../../src/api/cutout/install.js';
import * as kit from './kit.js';

const SCRIPT = fileURLToPath(new URL('../../scripts/install-cutout.js', import.meta.url));
const MODEL = Buffer.from(Array.from({ length: 5000 }, (_, i) => (i * 31) % 251));

describe('model installer', () => {
  let box;
  let server;
  let base;
  const hits = [];
  const fine = async () => ({ reason: '', broken: false });
  const install = (more = {}) => {
    const lines = [];
    const options = { dataDir: box.data, log: (line) => lines.push(line), check: fine };
    return installModel({ url: `${base}/model.onnx`, ...options, ...more }).then(
      (result) => ({ ...result, lines }),
      (err) => ({ error: err.message, lines }),
    );
  };
  const target = () => join(box.data, 'models', 'modnet.onnx');
  const inFolder = () =>
    existsSync(join(box.data, 'models')) ? readdirSync(join(box.data, 'models')) : [];

  before(async () => {
    box = kit.cutoutSandbox('cutout-install');
    server = createServer((req, res) => {
      hits.push(req.url);
      if (req.url === '/model.onnx')
        return res.writeHead(200, { 'content-length': MODEL.length }).end(MODEL);
      if (req.url === '/moved') return res.writeHead(302, { location: '/model.onnx' }).end();
      if (req.url === '/cut') {
        // Says 5000 bytes, sends 2000 and hangs up.
        res.writeHead(200, { 'content-length': MODEL.length });
        res.write(MODEL.subarray(0, 2000), () => res.destroy());
        return;
      }
      res.writeHead(404).end('no such file');
    });
    await new Promise((done) => server.listen(0, '127.0.0.1', () => done()));
    base = `http://127.0.0.1:${server.address().port}`;
  });
  after(async () => {
    await new Promise((done) => server.close(() => done()));
    box.cleanup();
  });

  it('knows the model it installs by default', () => {
    assert.equal(MODEL_URL, 'https://huggingface.co/Xenova/modnet/resolve/main/onnx/model.onnx');
    assert.equal(MODEL_BYTES, 25888640);
  });

  it('refuses what is not the file: a missing one, a cut-off one, one of another size', async () => {
    const missing = await install({ url: `${base}/nothing` });
    assert.match(missing.error, /^Cannot download the model \(.*\/nothing\): HTTP 404$/);
    const cut = await install({ url: `${base}/cut` });
    assert.match(cut.error, /^The download stopped|^The download is 2000 bytes, not 5000/);
    const other = await install({ bytes: 6000 });
    assert.equal(
      other.error,
      'The download is 5000 bytes, not 6000: it is not the model. Try again.',
    );
    const closed = createServer();
    await new Promise((done) => closed.listen(0, '127.0.0.1', () => done()));
    const { port } = closed.address();
    await new Promise((done) => closed.close(() => done()));
    const unreachable = await install({ url: `http://127.0.0.1:${port}/model.onnx` });
    assert.match(unreachable.error, /^Cannot download the model \(.*\): ECONNREFUSED$/);
    assert.deepEqual(inFolder(), [], 'nothing is left, whole or partial');
  });

  it('removes a download that does not load as a model', async () => {
    const seen = [];
    const check = async (file) => {
      seen.push(readFileSync(file).equals(MODEL));
      return { reason: 'Python says: the model does not load: INVALID_PROTOBUF', broken: true };
    };
    const bad = await install({ check });
    assert.equal(
      bad.error,
      'The downloaded file is not a model: Python says: the model does not load: INVALID_PROTOBUF',
    );
    assert.deepEqual(seen, [true], 'the whole download was there to be checked');
    assert.deepEqual(inFolder(), []);
  });

  it('saves the model into the data folder, following a redirect, and says it is ready', async () => {
    const made = await install({ url: `${base}/moved`, bytes: 5000 });
    assert.deepEqual(
      { path: made.path, downloaded: made.downloaded, ready: made.ready, reason: made.reason },
      { path: target(), downloaded: true, ready: true, reason: '' },
    );
    assert.ok(readFileSync(target()).equals(MODEL));
    assert.deepEqual(inFolder(), ['modnet.onnx']);
    assert.match(
      made.lines.join('\n'),
      /Downloading the matting model.*\n {2}from .*\/moved\nSaved 5000 bytes to /,
    );
    assert.equal(made.lines.at(-1), 'Ready: the model loads and runs.');
  });

  it('downloads nothing when the model is there, unless forced or of the wrong size', async () => {
    const before = hits.length;
    const again = await install({ bytes: 5000 });
    assert.deepEqual([again.downloaded, again.ready, hits.length], [false, true, before]);
    assert.match(again.lines[0], /^The model is already installed: /);
    assert.equal((await install({ bytes: 5000, force: true })).downloaded, true);
    writeFileSync(target(), 'half a file');
    const repaired = await install({ bytes: 5000 });
    assert.match(repaired.lines[0], /modnet\.onnx is 11 bytes, not 5000: downloading it again$/);
    assert.ok(repaired.downloaded && readFileSync(target()).equals(MODEL));
  });

  it('keeps the model and says what the Python side lacks', async () => {
    const reason = 'Python at python3 has no onnxruntime: python3 -m pip install onnxruntime numpy';
    const made = await install({
      bytes: 5000,
      force: true,
      check: async () => ({ reason, broken: false }),
    });
    assert.deepEqual([made.downloaded, made.ready, made.reason], [true, false, reason]);
    assert.equal(made.lines.at(-1), `Not ready yet: ${reason}`);
    assert.ok(existsSync(target()));
  });

  describe(
    'the script',
    { skip: process.platform === 'win32' && 'the stand-in Python is a shell script' },
    () => {
      let runs = 0;
      /** Run install-cutout, into a data folder of its own, with a stand-in for Python that ends its check with `code`. */
      const run = (code, args, env = {}) => {
        const python = join(box.root, `python-${code}`);
        const says = {
          0: `echo '{"python":"3.12","onnxruntime":"1.2","numpy":"2.0"}'`,
          3: `echo "person_matte: missing module onnxruntime (x)" >&2`,
        };
        writeFileSync(python, `#!/bin/sh\n${says[code]}\nexit ${code}\n`);
        chmodSync(python, 0o755);
        const data = join(box.root, `data-${runs++}`);
        mkdirSync(data, { recursive: true });
        const clean = { ...process.env, NEAREDIT_DATA_DIR: data, CUTOUT_PYTHON: python, ...env };
        for (const name of ['HTTPS_PROXY', 'https_proxy', 'CUTOUT_COMMAND', 'CUTOUT_MODEL'])
          delete clean[name];
        const child = spawn(process.execPath, [SCRIPT, ...args], { env: { ...clean, ...env } });
        let out = '';
        child.stdout.on('data', (chunk) => (out += chunk));
        child.stderr.on('data', (chunk) => (out += chunk));
        return new Promise((done) =>
          child.on('close', (status) => done({ status, out, data, python })),
        );
      };

      it("installs, checks with the worker's Python and exits 0", async () => {
        const done = await run(0, ['--url', `${base}/model.onnx`]);
        assert.equal(done.status, 0, done.out);
        assert.ok(readFileSync(join(done.data, 'models', 'modnet.onnx')).equals(MODEL));
        assert.match(done.out, /Ready: the model loads and runs\.\n$/);
      });

      it('exits 3 with the pip command when Python lacks onnxruntime, and keeps the model', async () => {
        const done = await run(3, ['--url', `${base}/model.onnx`]);
        assert.equal(done.status, 3, done.out);
        assert.ok(existsSync(join(done.data, 'models', 'modnet.onnx')));
        const pip = `Not ready yet: Python at ${done.python} has no onnxruntime: ${done.python} -m pip install onnxruntime numpy\n`;
        assert.ok(done.out.endsWith(pip), done.out);
      });

      it('exits 1 when the download fails, 2 for arguments it does not know', async () => {
        const failed = await run(0, ['--url', `${base}/nothing`]);
        assert.deepEqual(
          [failed.status, existsSync(join(failed.data, 'models', 'modnet.onnx'))],
          [1, false],
        );
        assert.match(failed.out, /HTTP 404/);
        const usage = await run(0, ['--fast']);
        assert.equal(usage.status, 2);
        assert.match(usage.out, /^Usage: npm run install-cutout -- \[--force\] \[--url <url>\]/);
        assert.equal((await run(0, ['--url'])).status, 2);
      });

      it('says when another setting will be used instead of the model', async () => {
        const done = await run(0, ['--url', `${base}/model.onnx`], {
          CUTOUT_MODEL: '/elsewhere/m.onnx',
        });
        assert.match(
          done.out,
          /Note: CUTOUT_MODEL is set — NearEdit reads \/elsewhere\/m\.onnx, not this file/,
        );
        const own = await run(0, ['--url', `${base}/model.onnx`], { CUTOUT_COMMAND: 'my-matte' });
        assert.match(
          own.out,
          /Note: CUTOUT_COMMAND is set — NearEdit uses that program, not this model/,
        );
      });
    },
  );
});
