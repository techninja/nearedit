/**
 * Project file manager — self-contained project JSON + sidecar metadata.
 *
 * Architecture:
 *   <project-dir>/.nearedit/project.json  — project config + adaptations + EDLs
 *   <media-dir>/filename.mp4.nearedit.json — sidecar metadata per media file
 *   data/registry.json                     — lightweight index of known project paths
 *
 * Sidecar files live next to source media. They're regenerated when the
 * source file's mtime changes (stale check on access).
 *
 * @module api/projects
 */

import { Router } from 'express';
import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import { randomUUID } from 'node:crypto';

export const projectsRouter = Router();

const DATA_DIR = resolve(process.cwd(), 'data');
const REGISTRY_PATH = resolve(DATA_DIR, 'registry.json');

// --- Registry: index of known project paths ---

/**
 *
 */
function loadRegistry() {
  mkdirSync(DATA_DIR, { recursive: true });
  if (!existsSync(REGISTRY_PATH)) writeFileSync(REGISTRY_PATH, '{}');
  return JSON.parse(readFileSync(REGISTRY_PATH, 'utf-8'));
}

/**
 *
 */
function saveRegistry(reg) {
  writeFileSync(REGISTRY_PATH, JSON.stringify(reg, null, 2));
}

// --- Project file operations ---

/**
 * Default project structure.
 * @param {string} name
 * @returns {object}
 */
function createProjectData(name) {
  return {
    id: randomUUID(),
    name,
    description: '',
    mediaFolders: [], // additional scan paths (external drives, NAS, etc.)
    adaptations: [
      {
        id: randomUUID(),
        name: 'Main Edit',
        parentAdaptationId: '',
        aspectRatio: '16:9',
        resolution: '1920x1080',
        fps: 30,
        status: 'draft',
        edl: {
          playheadPosition: 0,
          cursorPosition: 0,
          zoom: 1,
          scrollX: 0,
          tracks: [
            { trackId: 'v1', type: 'video', name: 'Video 1', muted: false, solo: false, clips: [] },
            { trackId: 'a1', type: 'audio', name: 'Audio 1', muted: false, solo: false, clips: [] },
          ],
        },
      },
    ],
    createdAt: new Date().toISOString(),
  };
}

/**
 * Read a project file from disk.
 * @param {string} projectDir - Absolute path to the project directory
 * @returns {object|null}
 */
function readProject(projectDir) {
  const filePath = resolve(projectDir, '.nearedit', 'project.json');
  if (!existsSync(filePath)) return null;
  return JSON.parse(readFileSync(filePath, 'utf-8'));
}

/**
 * Write a project file to disk.
 * @param {string} projectDir
 * @param {object} data
 */
function writeProject(projectDir, data) {
  const dir = resolve(projectDir, '.nearedit');
  mkdirSync(dir, { recursive: true });
  writeFileSync(resolve(dir, 'project.json'), JSON.stringify(data, null, 2));
}

// --- Sidecar metadata ---

/**
 * Get the sidecar path for a media file.
 * @param {string} mediaPath - Absolute path to media file
 * @returns {string}
 */
function sidecarPath(mediaPath) {
  return `${mediaPath}.nearedit.json`;
}

/**
 * Read sidecar metadata. Returns null if missing or stale.
 * @param {string} mediaPath
 * @returns {object|null}
 */
export function readSidecar(mediaPath) {
  const path = sidecarPath(mediaPath);
  if (!existsSync(path)) return null;
  const sidecar = JSON.parse(readFileSync(path, 'utf-8'));
  // Stale check: if source mtime is newer, sidecar needs regeneration
  const sourceMtime = statSync(mediaPath).mtimeMs;
  if (sidecar._sourceMtime && sidecar._sourceMtime < sourceMtime) return null;
  return sidecar;
}

/**
 * Write sidecar metadata next to a media file.
 * @param {string} mediaPath
 * @param {object} metadata
 */
export function writeSidecar(mediaPath, metadata) {
  const sourceMtime = statSync(mediaPath).mtimeMs;
  const data = { ...metadata, _sourceMtime: sourceMtime, _updatedAt: new Date().toISOString() };
  writeFileSync(sidecarPath(mediaPath), JSON.stringify(data, null, 2));
}

// --- API Routes ---

/** GET /api/projects — list all known projects from registry */
projectsRouter.get('/projects', (_req, res) => {
  const reg = loadRegistry();
  const projects = Object.entries(reg).map(([id, entry]) => {
    const data = readProject(entry.path);
    return data || { id, name: basename(entry.path), path: entry.path, error: 'unreadable' };
  });
  res.json({ data: projects, total: projects.length });
});

/** POST /api/projects — create a new project at a given directory */
projectsRouter.post('/projects', (req, res) => {
  const { name, path: projectDir } = req.body;
  if (!name || !projectDir) return res.status(422).json({ error: 'name and path required' });

  const data = createProjectData(name);
  writeProject(projectDir, data);

  // Register it
  const reg = loadRegistry();
  reg[data.id] = { path: projectDir, name };
  saveRegistry(reg);

  res.status(201).json(data);
});

/** GET /api/projects/:id — read a project by registry ID */
projectsRouter.get('/projects/:id', (req, res) => {
  const reg = loadRegistry();
  const entry = reg[req.params.id];
  if (!entry) return res.status(404).json({ error: 'Project not found in registry' });
  const data = readProject(entry.path);
  if (!data) return res.status(404).json({ error: 'Project file not found on disk' });
  res.json(data);
});

/** PUT /api/projects/:id — update project data */
projectsRouter.put('/projects/:id', (req, res) => {
  const reg = loadRegistry();
  const entry = reg[req.params.id];
  if (!entry) return res.status(404).json({ error: 'Project not found' });
  const existing = readProject(entry.path);
  if (!existing) return res.status(404).json({ error: 'Project file missing' });
  const updated = { ...existing, ...req.body, id: existing.id, createdAt: existing.createdAt };
  writeProject(entry.path, updated);
  res.json(updated);
});

/** PUT /api/projects/:id/edl/:adaptationId — save an adaptation's EDL */
projectsRouter.put('/projects/:id/edl/:adaptationId', (req, res) => {
  const reg = loadRegistry();
  const entry = reg[req.params.id];
  if (!entry) return res.status(404).json({ error: 'Project not found' });
  const project = readProject(entry.path);
  if (!project) return res.status(404).json({ error: 'Project file missing' });

  const adaptation = project.adaptations.find((a) => a.id === req.params.adaptationId);
  if (!adaptation) return res.status(404).json({ error: 'Adaptation not found' });

  adaptation.edl = req.body;
  writeProject(entry.path, project);
  res.json(adaptation);
});

/** GET /api/projects/:id/edl/:adaptationId — load an adaptation's EDL */
projectsRouter.get('/projects/:id/edl/:adaptationId', (req, res) => {
  const reg = loadRegistry();
  const entry = reg[req.params.id];
  if (!entry) return res.status(404).json({ error: 'Project not found' });
  const project = readProject(entry.path);
  if (!project) return res.status(404).json({ error: 'Project file missing' });

  const adaptation = project.adaptations.find((a) => a.id === req.params.adaptationId);
  if (!adaptation) return res.status(404).json({ error: 'Adaptation not found' });
  res.json(adaptation.edl);
});

/** GET /api/sidecar?path=/absolute/path/to/file.mp4 — read sidecar metadata */
projectsRouter.get('/sidecar', (req, res) => {
  const filePath = req.query.path;
  if (!filePath) return res.status(400).json({ error: 'path required' });
  const data = readSidecar(filePath);
  res.json(data || { exists: false, stale: true });
});

/** PUT /api/sidecar?path=/absolute/path/to/file.mp4 — write sidecar metadata */
projectsRouter.put('/sidecar', (req, res) => {
  const filePath = req.query.path;
  if (!filePath) return res.status(400).json({ error: 'path required' });
  if (!existsSync(filePath)) return res.status(404).json({ error: 'Source file not found' });
  writeSidecar(filePath, req.body);
  res.json({ ok: true });
});
