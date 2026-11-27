/**
 * The SSH provider and provider selection: quoting for the remote shell
 * (checked with a real `sh`), the argument array, and `auto` resolution.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { createSshTranscriber, mediaUrl, remoteCommand, shellQuote } from './ssh.js';
import { resolveTranscriber } from './index.js';
import { exitError, fakeRunner, settingsWith as withSettings } from '../testing/fakes.js';
import { tempDir } from '../testing/media.js';

let dir;
let cleanup;
before(() => ({ dir, cleanup } = tempDir('nearedit-ssh-test-')));
after(() => cleanup());

const settingsWith = (transcription = {}) => withSettings({ dataDir: dir, transcription });

test('ssh: values are quoted for the remote shell — verified with a real sh', () => {
  const nasty = '/media/it\'s; rm -rf ~ $(reboot) `id` & "x".mp4';
  const url = mediaUrl('http://10.0.0.2:6556/', nasty);
  assert.ok(url.startsWith('http://10.0.0.2:6556/api/media/file?path=%2Fmedia%2Fit%27s%3B%20rm'));
  assert.doesNotMatch(url, /['"`$;& ()]/, 'nothing shell-active survives encoding');
  assert.equal(new URL(url).searchParams.get('path'), nasty, 'and it decodes back');
  assert.equal(shellQuote("a'b"), "'a'\\''b'");

  // Let a real POSIX shell split the command the way the remote side would.
  const hostile = {
    url: `http://h/x?p=1&q='$(touch ${dir}/pwned)'`,
    model: 'base; echo hacked',
    language: '`id`',
  };
  const appended = execFileSync('sh', ['-c', remoteCommand("printf '%s\\n'", hostile)]).toString();
  assert.deepEqual(appended.split('\n').slice(0, -1), [
    hostile.url,
    '--model',
    hostile.model,
    '--language',
    hostile.language,
  ]);
  const templated = remoteCommand("printf '%s\\n' {model} {url} {language}", hostile);
  assert.deepEqual(execFileSync('sh', ['-c', templated]).toString().split('\n').slice(0, -1), [
    hostile.model,
    hostile.url,
    hostile.language,
  ]);
  assert.equal(existsSync(join(dir, 'pwned')), false, 'no command substitution ran');
  assert.equal(remoteCommand('run.sh', { url: 'u', model: 'm' }), "run.sh 'u' --model 'm'");
});

test('ssh: argument array, legacy JSON output and configuration checks', async () => {
  const cfg = {
    sshHost: 'gpu@hydra',
    sshCommand: '~/env/bin/python3 ~/workers/transcribe.py',
    publicUrl: 'http://10.0.0.2:6556',
    model: 'medium',
  };
  const legacy = {
    words: [{ word: ' Hello', start: 0.5, end: 0.8, probability: 0.9 }],
    segments: [{ start: 0.5, end: 0.8, text: ' Hello' }],
    language: 'en',
    duration: 1,
  };
  const { deps, calls } = fakeRunner({
    ssh: (args) =>
      args.at(-1) === 'true'
        ? null
        : { stdout: `Loading model...\n${JSON.stringify(legacy)}\n`, stderr: '' },
  });
  const provider = createSshTranscriber(settingsWith(cfg), deps);
  assert.deepEqual(await provider.available(), { available: true, detail: 'ssh gpu@hydra' });
  const result = await provider.transcribe("/media/o'brien.mp4", { language: 'en' });
  assert.deepEqual(result.words, [{ word: 'Hello', start: 0.5, end: 0.8, probability: 0.9 }]);
  const { args } = calls.at(-1);
  assert.deepEqual(args.slice(0, -1), [
    '-o',
    'BatchMode=yes',
    '-o',
    'ServerAliveInterval=30',
    '-o',
    'ConnectTimeout=15',
    '--',
    'gpu@hydra',
  ]);
  assert.equal(
    args.at(-1),
    "~/env/bin/python3 ~/workers/transcribe.py 'http://10.0.0.2:6556/api/media/file?path=%2Fmedia%2Fo%27brien.mp4' --model 'medium' --language 'en'",
  );

  const check = async (override) =>
    (await createSshTranscriber(settingsWith({ ...cfg, ...override }), deps).available()).detail;
  assert.equal(await check({ sshHost: '' }), 'HYDRA_HOST is not set');
  assert.equal(
    await check({ sshHost: '-oProxyCommand=evil' }),
    'HYDRA_HOST is not a valid ssh host',
  );
  assert.equal(await check({ sshCommand: '' }), 'TRANSCRIBE_SSH_COMMAND is not set');
  assert.match(await check({ publicUrl: '' }), /SERVER_HOST is not set/);
  await assert.rejects(
    createSshTranscriber(settingsWith({ ...cfg, sshHost: '-x' }), deps).transcribe('/a.mp4'),
    /not a valid ssh host/,
  );
  const down = fakeRunner({
    ssh: () =>
      Promise.reject(
        exitError(255, 'ssh exited 255: ssh: connect to host hydra port 22: Connection refused'),
      ),
  });
  assert.match(
    (await createSshTranscriber(settingsWith(cfg), down.deps).available()).detail,
    /gpu@hydra: .*Connection refused/,
  );
});

test('provider selection: none, unknown, named and auto (first usable, in order)', async () => {
  const python = {
    python3: (args) => (args[0] === '-c' ? { stdout: '1.2.1\n', stderr: '' } : null),
  };
  const off = await resolveTranscriber(settingsWith({ provider: 'none' }), fakeRunner({}).deps);
  assert.deepEqual(
    [off.provider, off.available, off.detail],
    [null, false, 'disabled (TRANSCRIBE_PROVIDER=none)'],
  );
  const unknown = await resolveTranscriber(settingsWith({ provider: 'siri' }), fakeRunner({}).deps);
  assert.match(unknown.detail, /unknown TRANSCRIBE_PROVIDER "siri"/);

  const base = {
    provider: 'auto',
    whisperCppModelPath: '',
    model: 'base',
    python: 'python3',
    url: '',
    apiKey: '',
    sshHost: '',
  };
  const auto = await resolveTranscriber(settingsWith(base), fakeRunner(python).deps);
  assert.deepEqual([auto.name, auto.available], ['faster-whisper', true]);
  assert.equal(auto.provider.name, 'faster-whisper');

  const nothing = await resolveTranscriber(settingsWith(base), fakeRunner({}).deps);
  assert.deepEqual([nothing.name, nothing.available, nothing.provider], ['auto', false, null]);
  for (const name of ['whisper-cpp:', 'faster-whisper:', 'openai:', 'ssh:'])
    assert.ok(nothing.detail.includes(name), name);

  const named = await resolveTranscriber(
    settingsWith({ ...base, provider: 'whisper-cpp' }),
    fakeRunner(python).deps,
  );
  assert.deepEqual([named.name, named.available, named.provider], ['whisper-cpp', false, null]);
});
