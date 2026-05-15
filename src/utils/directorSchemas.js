/**
 * Director action schemas — defines available actions and their form fields.
 * Pure data, no logic. Consumed by the director panel UI.
 * @module utils/directorSchemas
 */

export const DIRECTIVE_SCHEMAS = {
  generate_edit: {
    title: 'Generate Edit',
    description: 'AI assembles a rough cut from available media',
    fields: {
      style: { type: 'select', label: 'Style', options: ['thoughtful introspective voiceover', 'energetic highlight reel', 'comedy podcast', 'trailer for campy horror', 'tech demo with highlights', 'calm nature documentary', 'custom'], default: 'thoughtful introspective voiceover' },
      mood: { type: 'select', label: 'Mood', options: ['contemplative', 'upbeat', 'dramatic', 'playful', 'serene', 'intense', 'nostalgic'], default: 'contemplative' },
      duration: { type: 'range', label: 'Target Duration', min: 10, max: 600, step: 5, default: 60, format: (v) => v >= 60 ? `${(v / 60).toFixed(1)}m` : `${v}s` },
      promptSource: { type: 'prompt-source', label: 'Direction', placeholder: 'Describe what you want, or select a script file...', default: '' },
      narrationSource: { type: 'select', label: 'Narration Source', options: ['auto (from transcript)', 'none', 'generate TTS'], default: 'auto (from transcript)' },
      pacing: { type: 'select', label: 'Pacing', options: ['slow', 'medium', 'fast', 'match narration'], default: 'match narration' },
      replaceTimeline: { type: 'toggle', label: 'Replace existing timeline', default: false },
    },
  },
  insert_broll: {
    title: 'Insert B-Roll',
    description: 'Place b-roll at cursor or over selection',
    fields: {
      promptSource: { type: 'prompt-source', label: 'What should this show?', placeholder: 'e.g. "calm nature shot" or select a script...', default: '' },
      duration: { type: 'range', label: 'Duration', min: 1, max: 30, step: 0.5, default: 5, format: (v) => `${v}s` },
      source: { type: 'select', label: 'Source', options: ['from library (auto-match)', 'placeholder (find later)', 'generate'], default: 'from library (auto-match)' },
      transition: { type: 'select', label: 'Transition', options: ['cut', 'crossfade', 'fade from black'], default: 'cut' },
    },
  },
  add_narration: {
    title: 'Add Narration',
    description: 'Select and place a narration segment from transcript',
    fields: {
      promptSource: { type: 'prompt-source', label: 'Topic / Keywords', placeholder: 'e.g. "cosmic consciousness" or select a script section...', default: '' },
      duration: { type: 'range', label: 'Max Duration', min: 5, max: 120, step: 5, default: 30, format: (v) => `${v}s` },
      placement: { type: 'select', label: 'Placement', options: ['at cursor', 'append to end', 'replace selection'], default: 'at cursor' },
    },
  },
  remove_silence: {
    title: 'Remove Silence',
    description: 'Tighten edit by removing dead air from narration',
    fields: {
      threshold: { type: 'range', label: 'Silence Threshold', min: 0.2, max: 3.0, step: 0.1, default: 0.8, format: (v) => `${v}s` },
      padding: { type: 'range', label: 'Padding', min: 0, max: 0.5, step: 0.05, default: 0.1, format: (v) => `${(v * 1000).toFixed(0)}ms` },
      scope: { type: 'select', label: 'Scope', options: ['entire timeline', 'selected clips', 'audio tracks only'], default: 'entire timeline' },
    },
  },
  add_placeholder: {
    title: 'Add Placeholder',
    description: 'Mark a slot for future content',
    fields: {
      intent: { type: 'select', label: 'Intent', options: ['narration', 'broll', 'sfx', 'music', 'title', 'transition'], default: 'broll' },
      label: { type: 'text', label: 'Label', placeholder: 'What goes here?', default: '' },
      promptSource: { type: 'prompt-source', label: 'Description / Prompt', placeholder: 'Details for generation or search...', default: '' },
      duration: { type: 'range', label: 'Duration', min: 1, max: 60, step: 1, default: 5, format: (v) => `${v}s` },
    },
  },
};
