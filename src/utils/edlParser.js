/**
 * EDL JSON parser — repair, validate, and normalize LLM output.
 * Uses jsonrepair for broken JSON recovery and ajv for schema validation.
 * @module utils/edlParser
 */

import { jsonrepair } from 'jsonrepair';
import Ajv from 'ajv';

const ajv = new Ajv({ allErrors: true, useDefaults: true, coerceTypes: true });

/** JSON Schema for a clip */
const clipSchema = {
  type: 'object',
  properties: {
    clipId: { type: 'string', default: '' },
    sourceFile: { type: 'string', default: '' },
    sourceIn: { type: 'number', default: 0 },
    sourceOut: { type: 'number', default: 0 },
    timelineStart: { type: 'number', default: 0 },
    timelineEnd: { type: 'number', default: 0 },
    fadeIn: { type: 'number', default: 0 },
    fadeOut: { type: 'number', default: 0 },
    linkedClipId: { type: 'string', default: '' },
    placeholder: { type: 'boolean', default: false },
    label: { type: 'string', default: '' },
    prompt: { type: 'string', default: '' },
    intent: { type: 'string', default: '' },
    color: { type: 'string', default: '' },
    transform: {
      type: 'object',
      default: {},
      properties: {
        x: { type: 'number', default: 0 },
        y: { type: 'number', default: 0 },
        scaleX: { type: 'number', default: 1 },
        scaleY: { type: 'number', default: 1 },
        rotation: { type: 'number', default: 0 },
        opacity: { type: 'number', default: 1 },
        cropTop: { type: 'number', default: 0 },
        cropBottom: { type: 'number', default: 0 },
        cropLeft: { type: 'number', default: 0 },
        cropRight: { type: 'number', default: 0 },
        anchorX: { type: 'number', default: 0.5 },
        anchorY: { type: 'number', default: 0.5 },
      },
    },
  },
};

/** JSON Schema for a track */
const trackSchema = {
  type: 'object',
  properties: {
    trackId: { type: 'string', default: 'v1' },
    type: { type: 'string', enum: ['video', 'audio'], default: 'video' },
    name: { type: 'string', default: '' },
    muted: { type: 'boolean', default: false },
    solo: { type: 'boolean', default: false },
    clips: { type: 'array', items: clipSchema, default: [] },
  },
};

/** JSON Schema for the full EDL response */
const edlSchema = {
  type: 'object',
  properties: {
    tracks: { type: 'array', items: trackSchema, default: [] },
  },
  required: ['tracks'],
};

const validateEdl = ajv.compile(edlSchema);

/**
 * Parse and validate LLM output into a clean EDL object.
 * @param {string} rawContent - Raw LLM response text
 * @returns {{ edl: object|null, errors: string[], repaired: boolean }}
 */
export function parseEdlResponse(rawContent) {
  const errors = [];
  let repaired = false;

  // Step 1: Extract JSON from response (handle markdown fences)
  let jsonStr = rawContent;
  const fenceMatch = rawContent.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) jsonStr = fenceMatch[1];

  // Try to find the JSON object
  const objMatch = jsonStr.match(/\{[\s\S]*\}/);
  if (!objMatch) {
    const arrMatch = jsonStr.match(/\[[\s\S]*\]/);
    if (arrMatch) jsonStr = `{"tracks":${arrMatch[0]}}`;
    else return { edl: null, errors: ['No JSON object or array found in response'], repaired: false };
  } else {
    jsonStr = objMatch[0];
  }

  // Step 2: Try direct parse first
  let parsed = null;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (e) {
    // Step 3: Repair broken JSON
    errors.push(`Initial parse failed: ${e.message}`);
    try {
      const repairedStr = jsonrepair(jsonStr);
      parsed = JSON.parse(repairedStr);
      repaired = true;
      errors.push('JSON repaired successfully');
    } catch (e2) {
      errors.push(`Repair failed: ${e2.message}`);
      return { edl: null, errors, repaired: false };
    }
  }

  // Step 4: Normalize structure
  if (Array.isArray(parsed)) {
    parsed = { tracks: parsed };
  }
  if (!parsed.tracks && parsed.trackId) {
    // Single track returned
    parsed = { tracks: [parsed] };
  }

  // Step 5: Validate and apply defaults
  const valid = validateEdl(parsed);
  if (!valid) {
    const validationErrors = validateEdl.errors.map((e) => `${e.instancePath}: ${e.message}`);
    errors.push(...validationErrors);
    // ajv with useDefaults already mutated parsed to fill defaults
  }

  // Step 6: Ensure clips have IDs, valid timing, and correct field types
  if (parsed.tracks) {
    let clipCounter = 0;
    for (const track of parsed.tracks) {
      if (!track.trackId) track.trackId = track.type === 'audio' ? 'a1' : 'v1';
      if (!track.name) track.name = track.type === 'audio' ? 'Audio 1' : 'Video 1';
      if (typeof track.muted !== 'boolean') track.muted = false;
      if (typeof track.solo !== 'boolean') track.solo = false;
      if (!Array.isArray(track.clips)) track.clips = [];

      for (const clip of track.clips) {
        clipCounter++;
        if (!clip.clipId) clip.clipId = `clip_${String(clipCounter).padStart(3, '0')}`;
        // Ensure correct types
        clip.sourceFile = clip.sourceFile || '';
        clip.sourceIn = Number(clip.sourceIn) || 0;
        clip.sourceOut = Number(clip.sourceOut) || 0;
        clip.timelineStart = Number(clip.timelineStart) || 0;
        clip.timelineEnd = Number(clip.timelineEnd) || 0;
        clip.fadeIn = Number(clip.fadeIn) || 0;
        clip.fadeOut = Number(clip.fadeOut) || 0;
        clip.linkedClipId = clip.linkedClipId || '';
        clip.placeholder = !!clip.placeholder;
        clip.label = clip.label || '';
        clip.prompt = clip.prompt || '';
        clip.intent = clip.intent || '';
        clip.color = clip.color || '';
        // Ensure timing consistency
        if (clip.sourceOut <= clip.sourceIn && clip.timelineEnd > clip.timelineStart) {
          clip.sourceOut = clip.sourceIn + (clip.timelineEnd - clip.timelineStart);
        }
        if (clip.timelineEnd <= clip.timelineStart && clip.sourceOut > clip.sourceIn) {
          clip.timelineEnd = clip.timelineStart + (clip.sourceOut - clip.sourceIn);
        }
        // Ensure transform is a proper object with all fields
        const defaultXform = { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1, cropTop: 0, cropBottom: 0, cropLeft: 0, cropRight: 0, anchorX: 0.5, anchorY: 0.5 };
        if (!clip.transform || typeof clip.transform !== 'object') {
          clip.transform = { ...defaultXform };
        } else {
          clip.transform = { ...defaultXform, ...clip.transform };
        }
        // kenBurns must be an object or removed entirely
        if (clip.transform.kenBurns && typeof clip.transform.kenBurns !== 'object') {
          delete clip.transform.kenBurns;
        }
        // Remove any unexpected fields that could confuse hybrids
        const allowedKeys = ['clipId', 'sourceFile', 'sourceIn', 'sourceOut', 'timelineStart', 'timelineEnd', 'fadeIn', 'fadeOut', 'linkedClipId', 'placeholder', 'label', 'prompt', 'intent', 'color', 'transform'];
        for (const key of Object.keys(clip)) {
          if (!allowedKeys.includes(key)) delete clip[key];
        }
      }
    }
  }

  return { edl: parsed, errors, repaired };
}
