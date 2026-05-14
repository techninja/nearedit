/**
 * JSON Schema registry for NearEdit entities.
 *
 * Data model:
 *   Project → collection of assets + metadata
 *   Adaptation → aspect-ratio-locked timeline variant (infinitely nestable)
 *   Asset → indexed media file reference with probe metadata
 *
 * @module api/schemas
 */

/** @type {Map<string, { schema: object, layout: object }>} */
export const schemas = new Map();

schemas.set('projects', {
  schema: {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    title: 'Project',
    type: 'object',
    required: ['name'],
    properties: {
      id: { type: 'string', format: 'uuid', readOnly: true },
      name: { type: 'string', minLength: 1, maxLength: 200, title: 'Name' },
      description: { type: 'string', maxLength: 2000, default: '', title: 'Description' },
      sourceFolders: {
        type: 'string',
        default: '',
        title: 'Source Folders',
        description: 'Newline-separated absolute paths to media directories',
      },
      status: {
        type: 'string',
        enum: ['active', 'archived'],
        enumTitles: ['Active', 'Archived'],
        default: 'active',
        title: 'Status',
      },
      createdAt: { type: 'string', format: 'date-time', readOnly: true },
    },
  },
  layout: {
    groups: [
      { fields: ['name'], columns: 1 },
      { fields: ['description'], columns: 1 },
      { fields: ['sourceFolders'], columns: 1 },
      { fields: ['status'], columns: 1 },
    ],
    actions: { align: 'right' },
  },
});

schemas.set('adaptations', {
  schema: {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    title: 'Adaptation',
    type: 'object',
    required: ['name', 'projectId', 'aspectRatio'],
    properties: {
      id: { type: 'string', format: 'uuid', readOnly: true },
      projectId: { type: 'string', format: 'uuid', title: 'Project', writeOnly: true },
      parentAdaptationId: {
        type: 'string',
        format: 'uuid',
        default: '',
        title: 'Parent Adaptation',
        description: 'Empty = root adaptation of the project',
      },
      name: { type: 'string', minLength: 1, maxLength: 200, title: 'Name' },
      aspectRatio: {
        type: 'string',
        enum: ['16:9', '9:16', '1:1', '4:5', '4:3', '21:9', 'custom'],
        enumTitles: ['Landscape 16:9', 'Portrait 9:16', 'Square 1:1', 'Social 4:5', 'Classic 4:3', 'Ultrawide 21:9', 'Custom'],
        default: '16:9',
        title: 'Aspect Ratio',
      },
      resolution: { type: 'string', default: '1920x1080', title: 'Resolution' },
      fps: { type: 'number', default: 30, title: 'Frame Rate' },
      status: {
        type: 'string',
        enum: ['draft', 'review', 'final', 'rendered'],
        enumTitles: ['Draft', 'In Review', 'Final', 'Rendered'],
        default: 'draft',
        title: 'Status',
      },
      createdAt: { type: 'string', format: 'date-time', readOnly: true },
    },
  },
  layout: {
    groups: [
      { fields: ['name', 'aspectRatio'], columns: 2 },
      { fields: ['resolution', 'fps'], columns: 2 },
      { fields: ['status'], columns: 1 },
    ],
    actions: { align: 'right' },
  },
});

schemas.set('assets', {
  schema: {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    title: 'Asset',
    type: 'object',
    required: ['filename'],
    properties: {
      id: { type: 'string', format: 'uuid', readOnly: true },
      projectId: {
        type: 'string',
        default: '',
        title: 'Project',
        description: 'Empty = global asset available to all projects',
      },
      filename: { type: 'string', title: 'Filename' },
      type: {
        type: 'string',
        enum: ['video', 'audio', 'image'],
        default: 'video',
        title: 'Type',
      },
      category: {
        type: 'string',
        enum: ['footage', 'music', 'sfx', 'voiceover', 'logo', 'graphic', 'other'],
        enumTitles: ['Footage', 'Music', 'SFX', 'Voiceover', 'Logo', 'Graphic', 'Other'],
        default: 'footage',
        title: 'Category',
      },
      global: {
        type: 'boolean',
        default: false,
        title: 'Global',
        description: 'Available across all projects',
      },
      duration: { type: 'number', default: 0, title: 'Duration (s)' },
      tags: { type: 'string', default: '', title: 'Tags', description: 'Comma-separated' },
      transcript: { type: 'string', default: '', title: 'Transcript' },
      createdAt: { type: 'string', format: 'date-time', readOnly: true },
    },
  },
  layout: {
    groups: [
      { fields: ['filename', 'type'], columns: 2 },
      { fields: ['category', 'global'], columns: 2 },
      { fields: ['duration', 'tags'], columns: 2 },
      { fields: ['transcript'], columns: 1 },
    ],
    actions: { align: 'right' },
  },
});
