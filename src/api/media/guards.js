/**
 * Request guards for routes that take a media path.
 * @module api/media/guards
 */

import { statSync } from 'node:fs';
import { checkMediaPath } from '../lib/paths.js';

/**
 * Express middleware factory: the path in the query string (or JSON body)
 * must be inside the allowed roots (403 otherwise) and be an existing regular
 * file (404). On success the resolved path is on `res.locals.mediaPath` and
 * its `fs.Stats` on `res.locals.mediaStat`.
 * @param {string} [key='path'] - Query/body field holding the path
 * @returns {import('express').RequestHandler}
 */
export function requireMediaFile(key = 'path') {
  return (req, res, next) => {
    const given = req.query?.[key] ?? req.body?.[key];
    const result = checkMediaPath(given);
    if (result.ok === false) return res.status(result.status).json({ error: result.error });
    let stat;
    try {
      stat = statSync(result.path);
    } catch {
      return res.status(404).json({ error: 'File not found' }); // removed since the check
    }
    if (!stat.isFile()) return res.status(404).json({ error: 'Not a file' });
    res.locals.mediaPath = result.path;
    res.locals.mediaStat = stat;
    next();
  };
}
