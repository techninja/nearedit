/**
 * Why the editor could not open an adaptation, and what to offer instead.
 * Pure.
 * @module utils/ui/editorFailure
 */

import { HOME_URL, projectUrl } from '#utils/ui/routes.js';

/** @typedef {'project'|'adaptation'|'other'|''} MissingKind */

/**
 * Classify a failure of `openAdaptation`.
 * @param {any} err
 * @returns {{ missing: MissingKind, message: string }}
 */
export function describeFailure(err) {
  const message = err?.message || 'Unknown error';
  if (/adaptation not found/i.test(message)) return { missing: 'adaptation', message };
  if (err?.status === 404) return { missing: 'project', message };
  return { missing: 'other', message };
}

/**
 * What the failure view says and where its way back leads.
 * @param {MissingKind} missing
 * @param {string} message - The underlying error
 * @param {string} projectId
 * @returns {{ title: string, text: string, backUrl: string, backLabel: string, retry: boolean }}
 */
export function failureView(missing, message, projectId) {
  if (missing === 'project')
    return {
      title: 'Project not found',
      text: 'This server has no project with that address. It may have been removed from the list — its files are still in its folder and it can be added again.',
      backUrl: HOME_URL,
      backLabel: 'Go to your projects',
      retry: false,
    };
  if (missing === 'adaptation')
    return {
      title: 'Adaptation not found',
      text: 'The project exists, but it has no adaptation with that address. It may have been deleted.',
      backUrl: projectUrl(projectId),
      backLabel: 'Go to the project',
      retry: false,
    };
  return {
    title: 'The editor could not open this adaptation',
    text: message,
    backUrl: projectId ? projectUrl(projectId) : HOME_URL,
    backLabel: projectId ? 'Back to the project' : 'Go to your projects',
    retry: true,
  };
}
