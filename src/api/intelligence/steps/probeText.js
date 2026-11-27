/**
 * Text "probe": scripts, notes and subtitle files are indexed by parsing
 * their content — timed cues for SRT/VTT/ASS, heading sections for Markdown,
 * paragraphs for plain text.
 * @module api/intelligence/steps/probeText
 */

import { readFileSync } from 'node:fs';
import { extname } from 'node:path';

const NARRATION_WPM = 150;
const MAX_CONTENT_CHARS = 500_000;

/**
 * @typedef {Object} TextSection
 * @property {number} [start] - Seconds (subtitle cues)
 * @property {number} [end]
 * @property {string} [heading] - Markdown sections
 * @property {number} [level]
 * @property {number} [index] - Plain-text paragraphs
 * @property {string} text
 */

/**
 * Parse "HH:MM:SS,mmm", "MM:SS.mmm" or "H:MM:SS.cc" into seconds.
 * @param {string} stamp
 * @returns {number}
 */
export function parseCueTime(stamp) {
  const parts = stamp.trim().replace(',', '.').split(':').map(Number);
  return parts.reduce((total, part) => total * 60 + part, 0);
}

const CUE_TIMES = /((?:\d+:)?\d{1,2}:\d{2}[.,]\d{1,3})\s*-->\s*((?:\d+:)?\d{1,2}:\d{2}[.,]\d{1,3})/;

/**
 * Parse SRT or WebVTT into timed cues (cue numbers, identifiers, NOTE/STYLE
 * blocks and inline tags are dropped).
 * @param {string} content
 * @returns {TextSection[]}
 */
export function parseCues(content) {
  const cues = [];
  for (const block of content.replace(/\r/g, '').split(/\n{2,}/)) {
    const lines = block.split('\n');
    const at = lines.findIndex((line) => CUE_TIMES.test(line));
    if (at < 0) continue;
    const [, from, to] = lines[at].match(CUE_TIMES);
    const text = lines
      .slice(at + 1)
      .join(' ')
      .replace(/<[^>]*>/g, '')
      .trim();
    cues.push({ start: parseCueTime(from), end: parseCueTime(to), text });
  }
  return cues;
}

/**
 * Parse the Dialogue lines of an ASS/SSA subtitle file.
 * @param {string} content
 * @returns {TextSection[]}
 */
export function parseAss(content) {
  const cues = [];
  for (const line of content.replace(/\r/g, '').split('\n')) {
    if (!line.startsWith('Dialogue:')) continue;
    const fields = line.slice('Dialogue:'.length).split(',');
    if (fields.length < 10) continue;
    const text = fields
      .slice(9)
      .join(',')
      .replace(/\{[^}]*\}/g, '')
      .replace(/\\[Nn]/g, ' ')
      .trim();
    cues.push({ start: parseCueTime(fields[1]), end: parseCueTime(fields[2]), text });
  }
  return cues;
}

/**
 * Split Markdown into heading-based sections.
 * @param {string} content
 * @returns {TextSection[]}
 */
export function parseMarkdown(content) {
  const sections = [];
  let current = { heading: '', level: 0, text: '' };
  const flush = () => {
    if (current.heading || current.text.trim()) {
      sections.push({ ...current, text: current.text.trim() });
    }
  };
  for (const line of content.replace(/\r/g, '').split('\n')) {
    const heading = line.match(/^(#{1,6})\s+(.+)/);
    if (heading) {
      flush();
      current = { heading: heading[2].trim(), level: heading[1].length, text: '' };
    } else {
      current.text += `${line}\n`;
    }
  }
  flush();
  return sections;
}

/**
 * @param {string} content
 * @param {string} ext - Lower-case extension including the dot
 * @returns {TextSection[]}
 */
export function parseSections(content, ext) {
  if (ext === '.srt' || ext === '.vtt') return parseCues(content);
  if (ext === '.ass') return parseAss(content);
  if (ext === '.md') return parseMarkdown(content);
  return content
    .replace(/\r/g, '')
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((text, index) => ({ index, text }));
}

/**
 * Build the sidecar fields of a text file.
 * @param {string} filePath
 * @returns {{ subtype: string, wordCount: number, estimatedDuration: number, content: string,
 *   contentTruncated: boolean, sections: TextSection[] }}
 */
export function probeText(filePath) {
  const ext = extname(filePath).toLowerCase();
  const content = readFileSync(filePath, 'utf-8').replace(/^﻿/, '');
  const sections = parseSections(content, ext);
  const timed = ['.srt', '.vtt', '.ass'].includes(ext);
  const spoken = timed ? sections.map((s) => s.text).join(' ') : content;
  const wordCount = spoken.split(/\s+/).filter(Boolean).length;
  return {
    subtype: timed ? 'subtitle' : ext === '.md' ? 'script' : 'notes',
    wordCount,
    estimatedDuration: Math.round((wordCount / NARRATION_WPM) * 60 * 10) / 10,
    content: content.slice(0, MAX_CONTENT_CHARS),
    contentTruncated: content.length > MAX_CONTENT_CHARS,
    sections,
  };
}
