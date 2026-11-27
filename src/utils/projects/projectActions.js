/**
 * What the project page can do to a project: change its settings and
 * media folders, analyse its media, delete finished renders.
 * @module utils/projects/projectActions
 */

import { api } from '#utils/api/http.js';
import { deleteRender, updateProject } from '#utils/projects/api.js';
import { pickFolder } from '#utils/projects/folderPick.js';
import { projectPageState, reloadMedia, reloadRenders } from '#utils/projects/projectPage.js';
import { confirmAction } from '#utils/ui/confirm.js';
import { cancelOrDismiss, jobState } from '#utils/ui/jobCenter.js';
import { noteLongJobStarted } from '#utils/ui/notify.js';
import { showError, showToast } from '#utils/ui/toast.js';

/**
 * Send a change to the project and take over the server's answer.
 * @param {{ name?: string, description?: string, mediaFolders?: string[] }} patch
 * @param {string} failure - Toast title when it fails
 * @returns {Promise<boolean>} true when saved
 */
async function update(patch, failure) {
  const { id } = projectPageState.get();
  try {
    const project = await updateProject(id, patch);
    if (projectPageState.get().id === id) projectPageState.set({ project });
    return true;
  } catch (err) {
    const fields = Object.values(err.body?.fields || {}).join(' ');
    showToast({ kind: 'error', title: failure, detail: fields || err.body?.detail || err.message });
    return false;
  }
}

/**
 * Save the name and description.
 * @param {{ name: string, description: string }} values
 * @returns {Promise<boolean>}
 */
export async function saveSettings(values) {
  const name = values.name.trim();
  if (!name) {
    showToast({ kind: 'error', title: 'A project needs a name' });
    return false;
  }
  const saved = await update(
    { name, description: values.description },
    'Could not save the project',
  );
  if (saved) showToast({ kind: 'success', title: 'Project saved' });
  return saved;
}

/** Add a media folder, chosen with the folder browser. @returns {Promise<void>} */
export async function addMediaFolder() {
  const { project } = projectPageState.get();
  if (!project) return;
  const folder = await pickFolder({
    title: 'Add a media folder',
    confirmLabel: 'Add this folder',
    startPath: project.mediaFolders[project.mediaFolders.length - 1] || project.path,
  });
  if (!folder) return;
  if (folder.path === project.path || project.mediaFolders.includes(folder.path)) {
    showToast({ title: 'That folder is already part of the project' });
    return;
  }
  const mediaFolders = [...project.mediaFolders, folder.path];
  if (await update({ mediaFolders }, 'Could not add the folder')) reloadMedia();
}

/**
 * Stop using a media folder. Nothing on disk changes.
 * @param {string} path
 * @returns {Promise<void>}
 */
export async function removeMediaFolder(path) {
  const { project } = projectPageState.get();
  if (!project) return;
  const sure = await confirmAction({
    title: 'Stop using this folder?',
    message:
      `${path}\n\nIts files leave the media list; nothing is deleted. Clips on a timeline ` +
      'that use these files will show as missing until the folder is added again.',
    confirmLabel: 'Remove folder',
  });
  if (!sure) return;
  const mediaFolders = project.mediaFolders.filter((folder) => folder !== path);
  if (await update({ mediaFolders }, 'Could not remove the folder')) reloadMedia();
}

/** Analyse every media file of the project in one background job. @returns {Promise<void>} */
export async function startAnalysis() {
  const { id } = projectPageState.get();
  try {
    await api('/intelligence/analyze', { body: { projectId: id } });
    noteLongJobStarted();
  } catch (err) {
    showError('Could not start the analysis', err);
  }
}

/**
 * Delete a finished render, after asking.
 * @param {{ file: string }} render
 * @returns {Promise<void>}
 */
export async function removeRender(render) {
  const sure = await confirmAction({
    title: `Delete ${render.file}?`,
    message:
      'The rendered file is deleted from the server. The timeline it came from is not affected.',
    confirmLabel: 'Delete render',
    danger: true,
  });
  if (!sure) return;
  try {
    await deleteRender(render.file);
    // The job that made it would still offer links to the deleted file.
    const stale = jobState.get().jobs.filter((job) => job.result?.file === render.file);
    for (const job of stale) cancelOrDismiss(job);
  } catch (err) {
    if (err.status !== 404) showError('Could not delete the render', err);
  }
  reloadRenders();
}
