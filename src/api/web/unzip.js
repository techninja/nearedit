/**
 * Unpacking a ZIP archive with Node alone — enough for the archives Chrome
 * for Testing publishes: stored and deflated entries, folders, executable
 * bits, symbolic links. Entries are read one at a time, so an archive of a
 * few hundred megabytes does not have to fit in memory twice.
 * @module api/web/unzip
 */

import { chmodSync, closeSync, fstatSync, mkdirSync, openSync, readSync } from 'node:fs';
import { symlinkSync, writeFileSync } from 'node:fs';
import { dirname, resolve, sep } from 'node:path';
import { inflateRawSync } from 'node:zlib';

const END_OF_DIRECTORY = Buffer.from([0x50, 0x4b, 0x05, 0x06]);
const ENTRY = 0x02014b50;
const LINK = 0o120000;

/**
 * @param {number} fd
 * @param {number} from
 * @param {number} length
 * @returns {Buffer}
 */
function read(fd, from, length) {
  const buffer = Buffer.alloc(length);
  let done = 0;
  while (done < length) {
    const got = readSync(fd, buffer, done, length - done, from + done);
    if (!got) throw new Error('The archive ends too early: the download is incomplete');
    done += got;
  }
  return buffer;
}

/**
 * Unpack an archive.
 * @param {string} archive - The .zip file
 * @param {string} into - Folder to unpack into; created when missing
 * @returns {string[]} The files written, as paths inside the archive
 * @throws {Error} For something that is not a ZIP archive, or one that
 *   names a path outside the folder
 */
export function unzip(archive, into) {
  const root = resolve(into);
  const fd = openSync(archive, 'r');
  try {
    const { size } = fstatSync(fd);
    const tail = read(fd, Math.max(0, size - 65557), Math.min(size, 65557));
    const end = tail.lastIndexOf(END_OF_DIRECTORY);
    if (end < 0) throw new Error(`${archive} is not a ZIP archive`);
    const count = tail.readUInt16LE(end + 10);
    const directory = read(fd, tail.readUInt32LE(end + 16), tail.readUInt32LE(end + 12));
    if (count === 0xffff) throw new Error(`${archive} is a ZIP64 archive, which is not supported`);
    const written = [];
    let at = 0;
    for (let i = 0; i < count; i++) {
      if (directory.readUInt32LE(at) !== ENTRY) throw new Error(`${archive} is damaged`);
      const [method, packed] = [directory.readUInt16LE(at + 10), directory.readUInt32LE(at + 20)];
      const lengths = [28, 30, 32].map((offset) => directory.readUInt16LE(at + offset));
      const mode = directory.readUInt32LE(at + 38) >>> 16;
      const header = directory.readUInt32LE(at + 42);
      const name = directory.toString('utf8', at + 46, at + 46 + lengths[0]);
      at += 46 + lengths[0] + lengths[1] + lengths[2];
      const target = resolve(root, name);
      if (target !== root && !target.startsWith(root + sep))
        throw new Error(`${archive} names a path outside the folder: ${name}`);
      if (name.endsWith('/')) {
        mkdirSync(target, { recursive: true });
        continue;
      }
      // The entry's own header repeats the name; the data follows it.
      const local = read(fd, header, 30);
      const data = read(fd, header + 30 + local.readUInt16LE(26) + local.readUInt16LE(28), packed);
      if (method !== 0 && method !== 8) throw new Error(`${name}: unknown compression ${method}`);
      const content = method === 8 ? inflateRawSync(data) : data;
      mkdirSync(dirname(target), { recursive: true });
      if ((mode & 0o170000) === LINK) symlinkSync(content.toString(), target);
      else writeFileSync(target, content);
      if ((mode & 0o170000) !== LINK && mode & 0o111) chmodSync(target, 0o755);
      written.push(name);
    }
    return written;
  } finally {
    closeSync(fd);
  }
}
