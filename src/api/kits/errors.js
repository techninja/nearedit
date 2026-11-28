/**
 * How a kit that does not validate is answered: `422` with every problem
 * and the path of what it concerns, so a form can show each beside its
 * field. Contract: docs/app-spec/BRAND-API.md § Routes.
 * @module api/kits/errors
 */

import { HttpError } from '../lib/httpErrors.js';

/** @typedef {import('#utils/brand/types.js').Problem} Problem */

/** A kit that was not stored because it does not validate. */
export class InvalidKit extends HttpError {
  /**
   * @param {Problem[]} problems - Errors and warnings; at least one error
   * @param {string} [message]
   */
  constructor(problems, message = 'The kit does not validate') {
    const first = problems.find((problem) => problem.level === 'error') || problems[0];
    const detail = first ? `${first.path ? `${first.path}: ` : ''}${first.message}` : undefined;
    super(422, message, { detail });
    this.problems = problems;
  }
}

/**
 * @param {Problem[]} problems
 * @returns {boolean} True when one of them is an error
 */
export const hasErrors = (problems) => problems.some((problem) => problem.level === 'error');

/**
 * Express error middleware: an `InvalidKit` is answered with its problems;
 * everything else is passed on.
 * @param {any} err
 * @param {import('express').Request} _req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export function kitErrors(err, _req, res, next) {
  if (!(err instanceof InvalidKit) || res.headersSent) return next(err);
  res.status(422).json({ error: err.message, detail: err.detail, problems: err.problems });
}
