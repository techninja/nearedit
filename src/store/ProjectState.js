/**
 * The project and adaptation currently open in the editor.
 * Set once by the editor page after loading; read by every panel that needs
 * to call the API (media bin, director, export, transcript…), so no component
 * has to reach into another component to find the project id.
 * @module store/ProjectState
 */

import { store } from 'hybrids';

/**
 * @typedef {Object} ProjectStateShape
 * @property {string} projectId
 * @property {string} projectName
 * @property {string} adaptationId
 * @property {string} adaptationName
 * @property {string} aspectRatio
 * @property {boolean} loaded - True once the EDL has been loaded into the edit session
 * @property {boolean} dirty - Unsaved document changes exist
 * @property {string} saveError - Last save failure, empty when fine
 */

/** @type {import('hybrids').Model<ProjectStateShape>} */
const ProjectState = {
  projectId: '',
  projectName: '',
  adaptationId: '',
  adaptationName: '',
  aspectRatio: '16:9',
  loaded: false,
  dirty: false,
  saveError: '',
  [store.connect]: {
    get: () => ({}),
    set: (_id, values) => values,
  },
};

export default ProjectState;
