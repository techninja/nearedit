/**
 * Home page state: the project list and the "new project" form.
 * @module utils/projects/home
 */

import { createProject, listProjects, removeProject } from '#utils/projects/api.js';
import { pickFolder } from '#utils/projects/folderPick.js';
import { confirmAction } from '#utils/ui/confirm.js';
import { baseName } from '#utils/ui/format.js';
import { createObservable } from '#utils/ui/observable.js';
import { navigate, projectUrl } from '#utils/ui/routes.js';
import { showError, showToast } from '#utils/ui/toast.js';

/**
 * @typedef {Object} CreateForm
 * @property {string} path - Chosen folder; '' until one is chosen
 * @property {boolean} hasProject - The folder already holds a project: it will be opened
 * @property {string} name
 * @property {boolean} nameTouched - The user typed a name, so the folder no longer proposes one
 * @property {boolean} busy
 * @property {string} error
 * @typedef {Object} HomeState
 * @property {import('#utils/projects/api.js').Project[]} projects
 * @property {boolean} loading
 * @property {string} error - Why the list could not be loaded
 * @property {CreateForm|null} create - null while the form is closed
 */

/** @type {import('#utils/ui/observable.js').Observable<HomeState>} */
export const homeState = createObservable({ projects: [], loading: true, error: '', create: null });

const EMPTY_FORM = {
  path: '',
  hasProject: false,
  name: '',
  nameTouched: false,
  busy: false,
  error: '',
};

/** @param {Partial<CreateForm>} patch */
function patchCreate(patch) {
  const { create } = homeState.get();
  if (create) homeState.set({ create: { ...create, ...patch } });
}

/** Load the registered projects. @returns {Promise<void>} */
export async function loadProjects() {
  homeState.set({ loading: true, error: '' });
  try {
    homeState.set({ projects: await listProjects(), loading: false });
  } catch (err) {
    homeState.set({ loading: false, error: err.message });
  }
}

/** Open the "new project" form. */
export const openCreate = () => homeState.set({ create: { ...EMPTY_FORM } });

/** Close the form. */
export const closeCreate = () => homeState.set({ create: null });

/** @param {string} name */
export const setCreateName = (name) => patchCreate({ name, nameTouched: true, error: '' });

/** Let the user choose the project folder; the folder proposes the name. */
export async function chooseCreateFolder() {
  const folder = await pickFolder({
    title: 'Choose the project folder',
    confirmLabel: 'Use this folder',
    projectNote: 'This folder already holds a project — it will be opened.',
    startPath: homeState.get().create?.path,
  });
  const { create } = homeState.get();
  if (!folder || !create) return;
  const name = create.nameTouched ? create.name : baseName(folder.path);
  patchCreate({ path: folder.path, hasProject: folder.hasProject, name, error: '' });
}

/**
 * What stops the form from being sent.
 * @param {CreateForm} form
 * @returns {string} '' when it can be sent
 */
export function createProblem(form) {
  if (!form.path) return 'Choose a folder first';
  if (!form.hasProject && !form.name.trim()) return 'Give the project a name';
  return '';
}

/** Create (or open) the project and go to its page. @returns {Promise<void>} */
export async function submitCreate() {
  const { create } = homeState.get();
  if (!create || create.busy) return;
  const problem = createProblem(create);
  if (problem) return patchCreate({ error: problem });
  patchCreate({ busy: true, error: '' });
  try {
    const project = await createProject({ name: create.name.trim(), path: create.path });
    closeCreate();
    showToast({
      kind: 'success',
      title: create.hasProject ? `Opened “${project.name}”` : `Created “${project.name}”`,
    });
    navigate(projectUrl(project.id));
  } catch (err) {
    const fields = Object.values(err.body?.fields || {}).join(' ');
    patchCreate({
      busy: false,
      error: [err.message, fields || err.body?.detail].filter(Boolean).join(' — '),
    });
  }
}

/**
 * Take a project off the list, after asking. Its files stay where they are.
 * @param {import('#utils/projects/api.js').Project} project
 * @returns {Promise<void>}
 */
export async function forgetProject(project) {
  const sure = await confirmAction({
    title: `Remove “${project.name}” from the list?`,
    message:
      `No files are deleted. The project stays in ${project.path} and can be added again ` +
      'by choosing that folder.',
    confirmLabel: 'Remove from list',
  });
  if (!sure) return;
  try {
    await removeProject(project.id);
    homeState.set({ projects: homeState.get().projects.filter((p) => p.id !== project.id) });
    showToast({
      title: `Removed “${project.name}” from the list`,
      detail: 'Its files were not touched.',
    });
  } catch (err) {
    showError('Could not remove the project', err);
  }
}
