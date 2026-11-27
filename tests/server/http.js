/**
 * Minimal HTTP client helpers for the server tests. Not a test file itself.
 * @module tests/server/http
 */

import { request } from 'node:http';

/**
 * Make a request and read the response both as text and (when it parses) JSON.
 * @param {string} base - Server URL
 * @param {string} method
 * @param {string} path - Path and query, e.g. '/api/projects'
 * @param {unknown} [body] - Sent as JSON when given
 * @param {Record<string, string>} [headers]
 * @returns {Promise<{ status: number, body: any, text: string, headers: Headers }>}
 */
export async function call(base, method, path, body, headers = {}) {
  const init = { method, headers: { ...headers } };
  if (body !== undefined) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  const res = await fetch(base + path, init);
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null; // not JSON (a file, an image): callers use `text`
  }
  return { status: res.status, body: json, text, headers: res.headers };
}

/**
 * GET with exactly the headers given. `fetch` adds `Cache-Control: no-cache`
 * to requests that carry a validator, which defeats conditional requests.
 * @param {string} url
 * @param {Record<string, string>} [headers]
 * @returns {Promise<{ status: number, headers: import('node:http').IncomingHttpHeaders,
 *   data: Buffer }>}
 */
export function rawGet(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = request(url, { headers }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () =>
        resolve({ status: res.statusCode, headers: res.headers, data: Buffer.concat(chunks) }),
      );
    });
    req.on('error', reject);
    req.end();
  });
}

/**
 * @param {string} path - Absolute file path
 * @returns {string} Query string addressing it: '?path=…'
 */
export function q(path) {
  return `?path=${encodeURIComponent(path)}`;
}

/**
 * Read the pixel size from a JPEG's start-of-frame marker.
 * @param {Buffer} jpeg
 * @returns {{ width: number, height: number }}
 */
export function jpegSize(jpeg) {
  let offset = 2;
  while (offset < jpeg.length) {
    const marker = jpeg[offset + 1];
    const isFrameHeader = marker >= 0xc0 && marker <= 0xc3;
    if (isFrameHeader) {
      return { height: jpeg.readUInt16BE(offset + 5), width: jpeg.readUInt16BE(offset + 7) };
    }
    offset += 2 + jpeg.readUInt16BE(offset + 2);
  }
  throw new Error('No JPEG frame header found');
}
