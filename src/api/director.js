/**
 * AI Director — translates structured directives into EDL mutations.
 * Uses job queue for background processing. Results delivered via WebSocket.
 * @module api/director
 */

import { Router } from 'express';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { parseEdlResponse } from '../utils/edlParser.js';
import { createJob, updateJob } from './jobs.js';

export const directorRouter = Router();

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://192.168.86.65:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'qwen3:14b';

/**
 * Gather all indexed media metadata for a project.
 * @param {string} projectId
 * @returns {object[]}
 */
function gatherMediaContext(projectId) {
  const regPath = resolve(process.cwd(), 'data/registry.json');
  if (!existsSync(regPath)) return [];
  const reg = JSON.parse(readFileSync(regPath, 'utf-8'));
  const entry = reg[projectId];
  if (!entry?.path) return [];

  const media = [];
  /**
   *
   */
  function scan(dir) {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.name.startsWith('.') || e.name === 'node_modules') continue;
      const full = join(dir, e.name);
      if (e.isDirectory()) {
        scan(full);
        continue;
      }
      if (e.name.endsWith('.nearedit.json')) {
        try {
          const sidecar = JSON.parse(readFileSync(full, 'utf-8'));
          const sourceFile = full.replace('.nearedit.json', '');
          media.push({ filePath: sourceFile, ...sidecar });
        } catch {}
      }
    }
  }
  scan(entry.path);
  return media;
}

/**
 * Build the LLM prompt.
 */
function buildPrompt(media, directive, adaptation) {
  const { action, params, context } = directive;

  const mediaSummary = media
    .map((m) => {
      const parts = [
        `- ${m.filePath} (${m.type}, ${m.duration ? m.duration.toFixed(1) + 's' : 'no duration'})`,
      ];
      if (m.tags?.length) parts.push(`  tags: ${m.tags.slice(0, 15).join(', ')}`);
      if (m.segments?.length) {
        const total = m.segments.length;
        const sampleCount = Math.min(40, total);
        const step = Math.max(1, Math.floor(total / sampleCount));
        const sampled = [];
        for (let i = 0; i < total; i += step) sampled.push(m.segments[i]);
        const preview = sampled
          .map((s) => `[${s.start.toFixed(1)}s-${s.end.toFixed(1)}s] "${s.text}"`)
          .join('\n    ');
        parts.push(
          `  transcript (${total} segments, ${m.transcript?.length || 0} words, ${(m.duration / 60).toFixed(0)} min total):`,
        );
        parts.push(
          `  IMPORTANT: The first ~30s is audience noise/intro. Meaningful content starts around segment [30s+].`,
        );
        parts.push(`  Sampled segments across full duration:\n    ${preview}`);
      }
      if (m.content) parts.push(`  content: ${m.content.slice(0, 500)}`);
      return parts.join('\n');
    })
    .join('\n');

  const adaptationContext = adaptation
    ? `\nAdaptation: "${adaptation.name}"\n- Aspect Ratio: ${adaptation.aspectRatio}\n- Resolution: ${adaptation.resolution}\n- FPS: ${adaptation.fps}\n- Status: ${adaptation.status}`
    : '';

  const systemPrompt = `You are an AI video editor assistant. You output ONLY valid JSON — no markdown, no explanation, no code fences.

Available media:
${mediaSummary}

Timeline context:
- FPS: ${context.fps}
- Resolution: ${context.resolution}
- Playhead at: ${context.playheadPosition}s
- Existing tracks: ${context.totalTracks}${adaptationContext}

Your task: Given the user's directive, produce a JSON object with EDL mutations.
Consider the aspect ratio and format when choosing clips and framing.

Output format:
{
  "tracks": [
    {
      "trackId": "v1",
      "type": "video",
      "name": "Video 1",
      "muted": false,
      "solo": false,
      "clips": [
        {
          "clipId": "unique_id",
          "sourceFile": "/absolute/path/to/file.mp4 OR empty string for placeholders",
          "sourceIn": 0,
          "sourceOut": 5.5,
          "timelineStart": 0,
          "timelineEnd": 5.5,
          "fadeIn": 0,
          "fadeOut": 0.5,
          "linkedClipId": "",
          "placeholder": false,
          "label": "",
          "prompt": "",
          "intent": "",
          "color": ""
        }
      ]
    }
  ]
}

Rules:
- CRITICAL: Use the EXACT filePath values from the media list above for sourceFile. Copy them verbatim.
- For narration clips, use the audio file path and set sourceIn/sourceOut to the segment timestamps
- For b-roll, match video tags to the narration content at that point
- For still images, use ken burns (slow zoom/pan) by setting transform.kenBurns
- Video/images automatically FILL the frame (center-cropped, no letterboxing)
  - Use transform.x/y to offset the crop center for portrait adaptations
- Placeholders have placeholder:true, empty sourceFile, and a descriptive label/prompt
- Ensure clips don't overlap on the same track
- timelineEnd - timelineStart must equal sourceOut - sourceIn for real clips
- Generate unique clipId values (use format: clip_001, clip_002, etc.)
- Always include at least one video track and one audio track`;

  const promptLimit = action === 'execute_script' ? 3000 : 500;
  const userPrompt = `Action: ${action}\nParameters: ${JSON.stringify({ ...params, prompt: params.prompt?.slice(0, promptLimit) || '' })}\n\nGenerate the EDL tracks array.`;
  return { systemPrompt, userPrompt };
}

/**
 * Call Ollama with streaming, reporting progress via callback.
 * @param {string} systemPrompt
 * @param {string} userPrompt
 * @param {(tokens: number) => void} onProgress
 * @returns {Promise<object>}
 */
async function callLLM(systemPrompt, userPrompt, onProgress) {
  const res = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      stream: true,
      options: { temperature: 0.3, num_predict: 4096, num_ctx: 16384 },
    }),
  });

  let content = '';
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let tokenCount = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    for (const line of chunk.split('\n').filter(Boolean)) {
      try {
        const msg = JSON.parse(line);
        if (msg.message?.content) {
          content += msg.message.content;
          tokenCount++;
          if (tokenCount % 20 === 0) onProgress(tokenCount);
        }
      } catch {}
    }
  }

  console.log(`[Director] LLM returned ${content.length} chars, ${tokenCount} tokens`);

  const { edl, errors, repaired } = parseEdlResponse(content);
  if (repaired) console.log('[Director] JSON was repaired');
  if (errors.length) console.log('[Director] Parse notes:', errors);
  if (!edl) throw new Error(`Could not parse LLM response: ${errors.join('; ')}`);
  return edl;
}

/**
 * Resolve file paths in the EDL result.
 */
function resolvePaths(result, media) {
  const mediaMap = new Map();
  for (const m of media) {
    if (!m.filePath) continue;
    const fname = m.filename || m.filePath.split('/').pop();
    mediaMap.set(fname, m.filePath);
    mediaMap.set(m.filePath, m.filePath);
    const noExt = fname.replace(/\.[^.]+$/, '');
    if (!mediaMap.has(noExt)) mediaMap.set(noExt, m.filePath);
  }

  if (!result.tracks) return;
  for (const track of result.tracks) {
    if (!track.clips) continue;
    for (const clip of track.clips) {
      if (clip.placeholder) continue;
      if (!clip.sourceFile) {
        clip.placeholder = true;
        clip.label = clip.label || 'empty';
        continue;
      }
      if (existsSync(clip.sourceFile)) continue;
      const basename = clip.sourceFile.split('/').pop();
      let resolved = mediaMap.get(basename);
      if (!resolved && basename === 'undefined') {
        const videoFiles = media.filter((m) => m.type === 'video');
        if (videoFiles.length)
          resolved = videoFiles[Math.floor(Math.random() * videoFiles.length)].filePath;
      }
      if (!resolved) {
        for (const [key, val] of mediaMap) {
          if (basename.includes(key) || key.includes(basename)) {
            resolved = val;
            break;
          }
        }
      }
      if (resolved) {
        clip.sourceFile = resolved;
      } else {
        clip.placeholder = true;
        clip.label = clip.label || basename || 'unresolved';
        clip.sourceFile = '';
      }
    }
  }
}

/**
 * Build prompt for script generation (markdown output, not JSON).
 */
function buildScriptPrompt(media, directive, adaptation) {
  const { params } = directive;
  const mediaSummary = media
    .map((m) => {
      const parts = [
        `- ${m.filePath.split('/').pop()} (${m.type}, ${m.duration ? m.duration.toFixed(1) + 's' : '?'})`,
      ];
      if (m.tags?.length) parts.push(`  tags: ${m.tags.slice(0, 10).join(', ')}`);
      if (m.segments?.length) {
        const validSegs = m.segments.filter((s) => s.start >= 30);
        const targetDur = (params.duration || 60) * 1.5;
        const numBlocks = 5;
        const blockStep = Math.max(1, Math.floor(validSegs.length / numBlocks));
        const blocks = [];
        for (let b = 0; b < numBlocks; b++) {
          const startIdx = b * blockStep;
          let endIdx = startIdx;
          while (
            endIdx < validSegs.length &&
            validSegs[endIdx].end - validSegs[startIdx].start < targetDur
          )
            endIdx++;
          const slice = validSegs.slice(startIdx, endIdx);
          if (!slice.length) continue;
          const text = slice.map((s) => s.text).join(' ');
          blocks.push(
            `  --- BLOCK ${b + 1} [${slice[0].start.toFixed(0)}s - ${slice[slice.length - 1].end.toFixed(0)}s] ---\n  ${text}`,
          );
        }
        parts.push(
          `  transcript (${m.segments.length} segments, ${(m.duration / 60).toFixed(0)} min):`,
        );
        parts.push(
          `  Below are ${numBlocks} CANDIDATE BLOCKS. Pick ONE and use it IN ORDER (start to end).`,
        );
        parts.push(blocks.join('\n'));
      }
      if (m.content) parts.push(`  content: ${m.content.slice(0, 500)}`);
      return parts.join('\n');
    })
    .join('\n');

  const adaptCtx = adaptation
    ? `Format: ${adaptation.name} (${adaptation.aspectRatio}, ${adaptation.resolution})`
    : '';

  const systemPrompt = `You are an AI video editor writing an edit script. Output ONLY markdown.

Available media:
${mediaSummary}

${adaptCtx}

CRITICAL RULES:
1. Pick ONE block from the candidate blocks above. Stay within that block only — do NOT combine from multiple blocks.
2. Keep chronological order. You may SKIP tangential anecdotes or illustrative asides that don't advance the core argument, but never rearrange.
3. NEVER cut mid-sentence. Every included passage must start and end on a sentence boundary.
4. It is BETTER to go over the time target than to cut off mid-thought. Target is ${params.duration || 60}s but anywhere from ${Math.round((params.duration || 60) * 0.7)}s to ${Math.round((params.duration || 60) * 2.0)}s is acceptable.
5. The LAST sentence must be a conclusion, insight, or punchline — NEVER a setup for one. If you feel the urge to write "and so..." or "the remarkable thing is..." you MUST include what follows.
6. Cut the fat: rambling examples, repeated points, and tangents that a listener can follow without. Keep the thesis and its strongest supporting statements.

Format:

# Edit Script: [Title]

## Overview
- Style: ...
- Duration: ${Math.round((params.duration || 60) * 0.7)}s - ${Math.round((params.duration || 60) * 1.5)}s (finish the thought)
- Mood: ...

## Sequence

### 1. [Section Name] (Xs-Xs)
**Narration:** "[COMPLETE sentences]" (source: filename, STARTs-ENDs)
**Visual:** [match available video/image tags]

## Full Narration (as spoken)
[All quotes as one coherent paragraph]`;

  const userPrompt = `Style: ${params.style || 'contemplative'}\nMood: ${params.mood || 'contemplative'}\nTarget: ${params.duration || 60}s (but finish the thought even if it goes over)\nDirection: ${(params.prompt || '').slice(0, 300)}\n\nWrite the edit script. COMPLETE THOUGHTS ONLY.`;
  return { systemPrompt, userPrompt };
}

/**
 * Call LLM and return raw text (not parsed as JSON).
 */
async function callLLMRaw(systemPrompt, userPrompt, onProgress) {
  const res = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      stream: true,
      options: { temperature: 0.4, num_predict: 4096, num_ctx: 16384 },
    }),
  });
  let content = '';
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let tokenCount = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    for (const line of decoder.decode(value, { stream: true }).split('\n').filter(Boolean)) {
      try {
        const msg = JSON.parse(line);
        if (msg.message?.content) {
          content += msg.message.content;
          tokenCount++;
          if (tokenCount % 20 === 0) onProgress(tokenCount);
        }
      } catch {}
    }
  }
  return content;
}

/**
 * POST /api/director/script
 * Generates a markdown edit script (not EDL). Saves to project folder.
 */
directorRouter.post('/director/script', (req, res) => {
  const { directive, projectId } = req.body;
  if (!directive) return res.status(422).json({ error: 'directive required' });

  const media = gatherMediaContext(projectId);
  if (!media.length) return res.status(422).json({ error: 'No indexed media found.' });

  const variants = directive.params.variants || 3;
  const job = createJob('script', { directive, projectId, variants });
  res.status(202).json({ jobId: job.id });

  (async () => {
    try {
      updateJob(job.id, { status: 'running', log: ['Building script prompt...'], progress: 5 });

      let adaptation = null;
      const regPath = resolve(process.cwd(), 'data/registry.json');
      if (existsSync(regPath)) {
        const reg = JSON.parse(readFileSync(regPath, 'utf-8'));
        const entry = reg[projectId];
        if (entry?.path) {
          const projFile = resolve(entry.path, '.nearedit', 'project.json');
          if (existsSync(projFile)) {
            const proj = JSON.parse(readFileSync(projFile, 'utf-8'));
            adaptation = proj.adaptations?.[0];
          }
        }
      }

      const { systemPrompt, userPrompt } = buildScriptPrompt(media, directive, adaptation);
      const scripts = [];
      const reg = JSON.parse(readFileSync(regPath, 'utf-8'));
      const projectDir = reg[projectId]?.path;
      const adaptName = (adaptation?.name || 'main')
        .replace(/[^a-zA-Z0-9-_ ]/g, '')
        .replace(/\s+/g, '-')
        .toLowerCase();
      const scriptsDir = resolve(projectDir, 'scripts', adaptName);
      const { mkdirSync } = await import('node:fs');
      mkdirSync(scriptsDir, { recursive: true });

      for (let i = 0; i < variants; i++) {
        updateJob(job.id, {
          log: [`Generating option ${i + 1}/${variants}...`],
          progress: 10 + Math.floor((i / variants) * 80),
        });
        const variantAngles = [
          'Focus on the most poetic and philosophical moments. Choose segments that build a single coherent argument.',
          'Focus on surprising or provocative statements. Choose segments that challenge conventional thinking.',
          'Focus on nature imagery and sensory language. Choose segments that evoke the natural world.',
          'Focus on the most accessible, quotable moments. Choose segments a general audience would connect with.',
          'Focus on the emotional arc. Choose segments that build from question to insight to resolution.',
        ];
        const variantPrompt =
          userPrompt +
          `\n\nVariant angle: ${variantAngles[i % variantAngles.length]}\n\nIMPORTANT: After the sequence, add a "## Full Narration (as spoken)" section that concatenates ALL the narration quotes in order as one continuous paragraph, so the editor can verify it reads coherently as a single piece.`;
        const script = await callLLMRaw(systemPrompt, variantPrompt, (tokens) => {
          updateJob(job.id, {
            log: [`Option ${i + 1}: ${tokens} tokens...`],
            progress: 10 + Math.floor(((i + tokens / 2000) / variants) * 80),
          });
        });
        const filename = `script-${i + 1}.md`;
        const scriptPath = resolve(scriptsDir, filename);
        const { writeFileSync: wf } = await import('node:fs');
        wf(scriptPath, script);
        scripts.push({ script, filePath: scriptPath, filename, variant: i + 1 });
      }

      updateJob(job.id, {
        status: 'complete',
        result: { scripts, count: variants },
        progress: 100,
        log: [`${variants} scripts saved`],
      });
    } catch (err) {
      updateJob(job.id, { status: 'error', error: err.message });
    }
  })();
});

/**
 * POST /api/director
 * Creates a background job, returns jobId immediately.
 * Body: { directive, projectId }
 * Returns: { jobId }
 */
directorRouter.post('/director', (req, res) => {
  const { directive, projectId } = req.body;
  if (!directive) return res.status(422).json({ error: 'directive required' });

  const media = gatherMediaContext(projectId);
  if (!media.length)
    return res.status(422).json({ error: 'No indexed media found. Run Scan & Index first.' });

  // Create job and return immediately
  const job = createJob('director', { directive, projectId });
  res.status(202).json({ jobId: job.id });

  // Run in background
  (async () => {
    try {
      updateJob(job.id, { status: 'running', log: ['Building prompt...'], progress: 10 });

      let adaptation = null;
      const regPath = resolve(process.cwd(), 'data/registry.json');
      if (existsSync(regPath)) {
        const reg = JSON.parse(readFileSync(regPath, 'utf-8'));
        const entry = reg[projectId];
        if (entry?.path) {
          const projFile = resolve(entry.path, '.nearedit', 'project.json');
          if (existsSync(projFile)) {
            const proj = JSON.parse(readFileSync(projFile, 'utf-8'));
            adaptation = proj.adaptations?.[0];
          }
        }
      }

      const { systemPrompt, userPrompt } = buildPrompt(media, directive, adaptation);
      updateJob(job.id, { log: ['Calling LLM...'], progress: 20 });

      const result = await callLLM(systemPrompt, userPrompt, (tokens) => {
        updateJob(job.id, {
          log: [`Generating... (${tokens} tokens)`],
          progress: Math.min(90, 20 + Math.floor(tokens / 5)),
        });
      });

      updateJob(job.id, { log: ['Resolving paths...'], progress: 92 });
      resolvePaths(result, media);

      updateJob(job.id, { status: 'complete', result, progress: 100, log: ['Done'] });
      console.log('[Director] Job complete:', job.id);
    } catch (err) {
      console.error('[Director] Job error:', err.message);
      updateJob(job.id, { status: 'error', error: err.message, log: [`Error: ${err.message}`] });
    }
  })();
});
