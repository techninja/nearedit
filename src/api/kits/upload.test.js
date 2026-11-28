import assert from 'node:assert/strict';
import {
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { request } from 'node:http';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { rawGet } from '../../../tests/server/http.js';
import { MAX_FILE, MAX_FILES } from './limits.js';
import { PNG, call, createKitSandbox, send } from './testkit.js';

let sand;
let dir;
const get = (path) => call(sand.url, 'GET', `/api${path}`);
const del = (path) => call(sand.url, 'DELETE', `/api${path}`);
const upload = (name, bytes, opts) => send(sand.url, `/api/kits/acme/files/${name}`, bytes, opts);
const files = async () => (await get('/kits/acme')).body.files.map((file) => file.name);
const media = (path) => rawGet(`${sand.url}/api/media/file?path=${encodeURIComponent(path)}`);
/** Everything on disk under the sandbox that is not where it belongs would show here. */
const strays = () =>
  [sand.box.root, sand.box.data, sand.kits, sand.box.outside, sand.box.home]
    .flatMap((folder) => readdirSync(folder))
    .filter((name) => /evil|passwd|boot|\.part/.test(name));

before(async () => {
  sand = await createKitSandbox('kit-upload');
  await call(sand.url, 'PUT', '/api/kits/acme', { kit: { name: 'Acme' } });
  dir = join(sand.kits, 'acme');
});
after(() => sand?.close());

describe('PUT /kits/:id/files/:name', () => {
  it('stores the bytes of the request and lists the file', async () => {
    const res = await upload('logo.png', PNG, { type: 'image/png' });
    assert.deepEqual([res.status, res.body], [200, { name: 'logo.png', size: PNG.length }]);
    assert.deepEqual(readFileSync(join(dir, 'logo.png')), PNG);
    const font = await upload('Acme%20Sans-Bold.WOFF2', 'not really a font', {
      type: 'font/woff2',
    });
    assert.deepEqual(font.body, { name: 'Acme Sans-Bold.woff2', size: 17 });
    assert.deepEqual((await get('/kits/acme')).body.files, [
      { name: 'Acme Sans-Bold.woff2', size: 17 },
      { name: 'logo.png', size: PNG.length },
    ]);
    const replaced = await upload('logo.png', 'second', { chunked: true });
    assert.deepEqual(replaced.body, { name: 'logo.png', size: 6 });
    assert.equal(readFileSync(join(dir, 'logo.png'), 'utf8'), 'second');
  });

  it('reduces a hostile name to a base name inside the kit folder', async () => {
    const cases = {
      '..%2F..%2Fevil.png': 'evil.png',
      '%2Fetc%2Fpasswd.png': 'passwd.png',
      '..%5C..%5Cboot.gif': 'boot.gif',
      '%2E%2E%2Fevil2.png': 'evil2.png',
      '.hidden.webp': 'hidden.webp',
      'a%00b.png': 'a-b.png',
    };
    for (const [sent, kept] of Object.entries(cases)) {
      const res = await upload(sent, PNG);
      assert.deepEqual([res.status, res.body?.name], [200, kept], sent);
      assert.ok(existsSync(join(dir, kept)));
    }
    assert.deepEqual(strays(), [], 'nothing was written outside the kit folder');
    assert.ok(!existsSync('/etc/passwd.png'));
  });

  it('refuses kinds of file a kit does not hold, and names with nothing left', async () => {
    const before = await files();
    for (const name of [
      'kit.json',
      'x.svg',
      'page.html',
      'run.sh',
      'evil.png.exe',
      '.png',
      'plain',
    ]) {
      const res = await upload(name, '<script>alert(1)</script>');
      assert.deepEqual([res.status, res.body.error], [422, 'Not a file a kit can hold'], name);
      assert.match(res.body.fields.name, /png, jpg, jpeg, webp, gif, woff2, woff, ttf, otf/);
    }
    assert.deepEqual(await files(), before);
    assert.equal(JSON.parse(readFileSync(join(dir, 'kit.json'), 'utf8')).name, 'Acme');
  });

  it('refuses built-in kits, kits that are not there, and an empty body', async () => {
    const at = (id) => send(sand.url, `/api/kits/${id}/files/logo.png`, PNG);
    assert.equal((await at('builtin%3Aclean')).status, 403);
    assert.equal((await at('ghost')).status, 404);
    assert.equal((await at('..%2F..%2Fhome')).status, 404);
    assert.ok(!existsSync(join(sand.kits, 'ghost')));
    const empty = await upload('empty.png', '');
    assert.deepEqual([empty.status, existsSync(join(dir, 'empty.png'))], [400, false]);
  });

  it('refuses more than 10 MB — declared or not — and keeps nothing of it', async () => {
    assert.equal((await upload('fits.ttf', Buffer.alloc(MAX_FILE, 1))).status, 200);
    const over = await upload('over.ttf', Buffer.alloc(MAX_FILE + 1, 1));
    assert.deepEqual([over.status, over.body.error], [413, 'A kit file may be at most 10 MB']);
    const huge = Buffer.alloc(50 * 1024 * 1024, 7);
    assert.equal((await upload('huge.png', huge)).status, 413);
    assert.equal((await upload('stream.png', huge, { chunked: true })).status, 413);
    assert.equal((await upload('fits.ttf', huge, { chunked: true })).status, 413);
    const names = readdirSync(dir);
    assert.ok(!names.some((name) => /over|huge|stream|\.part/.test(name)), names.join(' '));
    assert.equal(
      lstatSync(join(dir, 'fits.ttf')).size,
      MAX_FILE,
      'the file that was there stays whole',
    );
    assert.equal((await get('/kits')).status, 200, 'the server still answers');
  });

  it('stores wrong content for its extension, and never serves it as anything else', async () => {
    const page = '<html><script>alert(document.cookie)</script></html>';
    assert.equal((await upload('page.png', page, { type: 'text/html' })).status, 200);
    assert.equal((await upload('code.woff2', 'alert(1)', { type: 'text/javascript' })).status, 200);
    const png = await media(join(dir, 'page.png'));
    assert.deepEqual(
      [png.status, png.headers['content-type'], png.headers['x-content-type-options']],
      [200, 'image/png', 'nosniff'],
    );
    const font = await media(join(dir, 'code.woff2'));
    assert.equal(font.headers['content-type'], 'application/octet-stream');
    assert.match(font.headers['content-disposition'], /^attachment/);
    assert.equal(font.headers['x-content-type-options'], 'nosniff');
    assert.equal(
      (await get('/kits/acme')).status,
      200,
      'and reading the kit does not read the file',
    );
  });

  it('does not write through a link, and does not follow one out of the folder', async () => {
    const secret = join(sand.box.outside, 'secret.txt');
    symlinkSync(secret, join(dir, 'link.png'));
    assert.ok(!(await files()).includes('link.png'), 'a link is not listed');
    assert.equal((await media(join(dir, 'link.png'))).status, 403, 'nor served');
    assert.equal((await upload('link.png', PNG)).status, 200);
    assert.equal(readFileSync(secret, 'utf8'), 'do not serve');
    assert.ok(lstatSync(join(dir, 'link.png')).isFile(), 'the link was replaced by the file');
    symlinkSync(secret, join(dir, 'again.png'));
    assert.equal((await del('/kits/acme/files/again.png')).status, 204);
    assert.equal(readFileSync(secret, 'utf8'), 'do not serve');
    symlinkSync(dir, join(sand.kits, 'alias'));
    assert.equal((await send(sand.url, '/api/kits/alias/files/x.png', PNG)).status, 404);
    const viaLink = await call(sand.url, 'PUT', '/api/kits/alias', { kit: { name: 'Alias' } });
    assert.equal(viaLink.status, 409);
    assert.equal(JSON.parse(readFileSync(join(dir, 'kit.json'), 'utf8')).name, 'Acme');
  });

  it('never leaves half a file: uploads at once, and one that breaks off', async () => {
    const bodies = Array.from({ length: 12 }, (_, i) => Buffer.alloc(300_000 + i, 65 + i));
    const done = await Promise.all(
      bodies.map((body) => upload('race.ttf', body, { chunked: true })),
    );
    assert.deepEqual([...new Set(done.map((res) => res.status))], [200]);
    const kept = readFileSync(join(dir, 'race.ttf'));
    assert.ok(
      bodies.some((body) => body.equals(kept)),
      'exactly one of them, whole',
    );
    await new Promise((resolve) => {
      const req = request(`${sand.url}/api/kits/acme/files/broken.ttf`, { method: 'PUT' });
      req.on('error', () => resolve());
      req.write(Buffer.alloc(200_000, 1), () => setTimeout(() => req.destroy(), 50));
      req.on('close', () => setTimeout(resolve, 100));
    });
    const names = readdirSync(dir);
    assert.ok(!names.some((name) => /broken|\.part/.test(name)), names.join(' '));
  });

  it('holds at most 64 files', async () => {
    await call(sand.url, 'PUT', '/api/kits/full', { kit: { name: 'Full' } });
    for (let i = 0; i < MAX_FILES; i++) writeFileSync(join(sand.kits, 'full', `f${i}.png`), PNG);
    const more = await send(sand.url, '/api/kits/full/files/one-more.png', PNG);
    assert.deepEqual(
      [more.status, more.body.error],
      [409, 'A kit holds at most 64 files: remove one first'],
    );
    assert.equal(
      (await send(sand.url, '/api/kits/full/files/f3.png', 'new')).status,
      200,
      'replacing is fine',
    );
  });
});

describe('DELETE /kits/:id/files/:name', () => {
  it('removes a file of the kit and nothing else', async () => {
    writeFileSync(join(sand.box.data, 'evil.png'), PNG);
    assert.equal((await del('/kits/acme/files/logo.png')).status, 204);
    assert.ok(!existsSync(join(dir, 'logo.png')));
    assert.equal((await del('/kits/acme/files/logo.png')).status, 404);
    for (const name of [
      '..%2F..%2Fevil.png',
      'kit.json',
      '%2E%2E%2Fkit.json',
      'sub%2Fx.png',
      '.png',
    ]) {
      assert.equal((await del(`/kits/acme/files/${name}`)).status, 404, name);
    }
    assert.ok(existsSync(join(sand.box.data, 'evil.png')));
    assert.ok(existsSync(join(dir, 'kit.json')));
    assert.equal((await del('/kits/builtin%3Aclean/files/logo.png')).status, 403);
    assert.equal((await del('/kits/ghost/files/logo.png')).status, 404);
  });
});
