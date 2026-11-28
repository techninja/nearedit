/**
 * The prompt that asks the LLM who speaks where, for the brand pass. The
 * model reads the transcripts of the files that speak on the timeline and
 * says, for each person, which file is theirs and — when the words show it
 * — the segment where they first speak. It never writes a time.
 * @module api/director/prompts/brandPass
 */

export const SPEAKERS_EXAMPLE = {
  speakers: [
    { name: 'Ada Lovelace', role: 'CEO', file: 'm1', segment: 1 },
    { name: 'Grace Hopper', role: 'Rear Admiral', file: 'm3' },
  ],
};

/** What the model's answer must look like. */
export const SPEAKERS_SCHEMA = {
  type: 'object',
  required: ['speakers'],
  properties: {
    speakers: {
      type: 'array',
      maxItems: 40,
      items: {
        type: 'object',
        required: ['name', 'file'],
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 120 },
          role: { type: 'string', maxLength: 160 },
          file: { type: 'string', minLength: 1, maxLength: 200 },
          segment: { type: 'integer', minimum: 1 },
        },
      },
    },
  },
};

export const SPEAKERS_SYSTEM = `You are the assistant editor inside a video editing program. A name caption is about to be put on screen for each person who speaks in an edit, and you say who speaks where. You are shown the files that speak on the timeline, with their transcripts.

Reply with ONE JSON object and nothing else: no commentary, no code fences.

Example of the shape (the handles are only an example):
${JSON.stringify(SPEAKERS_EXAMPLE, null, 1)}

Rules:
- "file" is the handle (m1, m2 ...) of the file that person speaks in. Use only files that are listed.
- "segment" is optional: the number of the transcript segment (s1, s2 ...) where that person first speaks — for example where they introduce themselves. Leave it out when you cannot tell.
- "role" is what the person is: keep the one you are given; add one only when the transcript says it ("I'm the head of design").
- When you are given names, return exactly those people, each once. When you are given none, return the people who introduce themselves by name in the transcripts.
- Never write times.`;

/**
 * @param {{ digest: string, speakers: { name: string, role: string }[] }} input
 * @returns {{ system: string, user: string }}
 */
export function speakersPrompt({ digest, speakers }) {
  const people = speakers.length
    ? speakers.map((s) => `- ${s.name}${s.role ? ` — ${s.role}` : ''}`)
    : ['(none were named: find the people who introduce themselves)'];
  const user = ['SPEAKING FILES', digest, '', 'PEOPLE', ...people, '', 'Reply with the JSON.'];
  return { system: SPEAKERS_SYSTEM, user: user.join('\n') };
}
