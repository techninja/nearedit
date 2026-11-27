/**
 * Optional access control. NearEdit is built for a trusted home or office
 * network, but it reads media folders and runs FFmpeg, so a password can be
 * required: set `NEAREDIT_PASSWORD` and every page, API route, media file
 * and WebSocket connection asks for it (HTTP Basic, user `NEAREDIT_USER`).
 *
 * After one successful Basic login the browser is handed a session cookie,
 * so requests that cannot carry the header reliably (WebSocket handshakes,
 * media elements in some browsers) are still recognised.
 * @module api/lib/auth
 */

import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { getConfig } from './config.js';

const COOKIE = 'nearedit_session';

/**
 * Constant-time string comparison (hashing first hides the lengths).
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
function safeEqual(a, b) {
  const digest = (value) => createHash('sha256').update(value).digest();
  return timingSafeEqual(digest(a), digest(b));
}

/**
 * The session cookie value for the configured credentials. Derived, not
 * stored: it stays valid across restarts and changes with the password.
 * @param {{ user: string, password: string }} auth
 * @returns {string}
 */
function sessionToken(auth) {
  return createHmac('sha256', auth.password).update(`nearedit:${auth.user}`).digest('hex');
}

/**
 * @param {string|undefined} header - Raw Cookie header
 * @returns {string} The session cookie value, or ''
 */
function sessionCookie(header) {
  for (const part of (header || '').split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === COOKIE) return rest.join('=');
  }
  return '';
}

/**
 * @param {string|undefined} header - Raw Authorization header
 * @returns {{ user: string, password: string }|null}
 */
function basicCredentials(header) {
  const match = /^Basic\s+([A-Za-z0-9+/=]+)$/i.exec(header || '');
  if (!match) return null;
  const decoded = Buffer.from(match[1], 'base64').toString('utf-8');
  const split = decoded.indexOf(':');
  if (split < 0) return null;
  return { user: decoded.slice(0, split), password: decoded.slice(split + 1) };
}

/** @returns {boolean} True when a password is configured */
export const authEnabled = () => Boolean(getConfig().auth.password);

/**
 * Does this request carry valid credentials (or is no password set)?
 * @param {import('node:http').IncomingMessage} req
 * @returns {boolean}
 */
export function isAuthorized(req) {
  const { auth } = getConfig();
  if (!auth.password) return true;
  const cookie = sessionCookie(req.headers.cookie);
  if (cookie && safeEqual(cookie, sessionToken(auth))) return true;
  const given = basicCredentials(req.headers.authorization);
  if (!given) return false;
  // Evaluate both so a wrong user name takes as long as a wrong password.
  const userOk = safeEqual(given.user, auth.user);
  const passwordOk = safeEqual(given.password, auth.password);
  return userOk && passwordOk;
}

/**
 * Express middleware guarding everything behind the password.
 * @type {import('express').RequestHandler}
 */
export function requireAuth(req, res, next) {
  const { auth } = getConfig();
  if (!auth.password) return next();
  if (!isAuthorized(req)) {
    res.set('WWW-Authenticate', 'Basic realm="NearEdit", charset="UTF-8"');
    return res.status(401).json({ error: 'Authentication required' });
  }
  if (!sessionCookie(req.headers.cookie)) {
    const secure = req.secure || req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
    res.append(
      'Set-Cookie',
      `${COOKIE}=${sessionToken(auth)}; Path=/; HttpOnly; SameSite=Strict${secure}`,
    );
  }
  next();
}
