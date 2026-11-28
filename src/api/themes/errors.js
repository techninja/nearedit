/**
 * How a theme that does not validate is answered: `422` with every problem
 * and the path of what it concerns. Contract: docs/app-spec/THEMES.md § Routes.
 * @module api/themes/errors
 */

import { HttpError } from '../lib/httpErrors.js';

/** @typedef {import('#utils/theme/model.js').Problem} Problem */

/** A theme that was not stored, or not read, because it does not validate. */
export class InvalidTheme extends HttpError {
  /**
   * @param {Problem[]} problems - Errors and warnings; at least one error
   * @param {string} [message]
   */
  constructor(problems, message = 'The theme does not validate') {
    const first = problems.find((problem) => problem.level === 'error') || problems[0];
    const detail = first ? `${first.path ? `${first.path}: ` : ''}${first.message}` : undefined;
    super(422, message, { detail });
    this.problems = problems;
  }
}

/**
 * @param {string} path
 * @param {string} message
 * @returns {InvalidTheme} A refusal with one problem
 */
export const invalid = (path, message) => new InvalidTheme([{ path, message, level: 'error' }]);

/**
 * @param {Problem[]} problems
 * @returns {boolean} True when one of them is an error
 */
export const hasErrors = (problems) => problems.some((problem) => problem.level === 'error');

/**
 * Express error middleware: an `InvalidTheme` is answered with its
 * problems; everything else is passed on.
 * @param {any} err
 * @param {import('express').Request} _req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export function themeErrors(err, _req, res, next) {
  if (!(err instanceof InvalidTheme) || res.headersSent) return next(err);
  res.status(422).json({ error: err.message, detail: err.detail, problems: err.problems });
}
